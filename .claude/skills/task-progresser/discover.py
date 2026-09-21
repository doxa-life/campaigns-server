#!/usr/bin/env python3
"""
Task-progresser discovery — print the next people group(s) needing onboarding work.

Reads:
  - GET /api/admin/people-groups/onboarding-status (server truth)
  - todo.csv in the people-groups checkout (local truth: research_done / prompts_done / reviewed / upload_done)
  - Local existence of research/findings/{slug}.md and day-in-the-life/prompts/{slug}.csv

The people-groups checkout is wherever this developer keeps it, so its path
comes from --repo or the doxa-repos registry, never from a fixed layout.

Prints one row per PG with outstanding work, listing what step comes next:
  RESEARCH | PROMPTS | UPLOAD | TRANSLATE | NEEDS_TAG

Usage:
  python3 .claude/skills/task-progresser/discover.py (--target local|prod) [--api-key KEY] [--repo PATH] [--limit N]
"""

import argparse
import csv
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

UA = 'task-progresser/1.0'


def auth_headers(api_key):
    return {'Authorization': f'Bearer {api_key}', 'User-Agent': UA}


def api_get(base_url, path, api_key):
    req = urllib.request.Request(f'{base_url}{path}', headers=auth_headers(api_key))
    return json.load(urllib.request.urlopen(req))


def parse_csv_line(line):
    parts = []
    cur = ''
    in_q = False
    for ch in line:
        if in_q:
            if ch == '"':
                in_q = False
            else:
                cur += ch
        elif ch == '"':
            in_q = True
        elif ch == ',':
            parts.append(cur)
            cur = ''
        elif ch != '\r':
            cur += ch
    parts.append(cur)
    return parts


def load_todo(todo_path):
    """Return dict[slug] -> dict with research_done/prompts_done/upload_done/reviewed."""
    if not todo_path.exists():
        return {}
    with open(todo_path, 'r', encoding='utf-8') as f:
        lines = [l for l in f.read().split('\n') if l.strip()]
    result = {}
    for line in lines[1:]:
        p = parse_csv_line(line)
        if len(p) < 6:
            continue
        slug = p[1].strip()
        if not slug:
            continue
        result[slug] = {
            'research_done': p[3].strip(),
            'prompts_done': p[4].strip(),
            'upload_done': p[5].strip(),
            'reviewed': p[8].strip() if len(p) > 8 else '',
        }
    return result


def resolve_repo(explicit):
    """The people-groups checkout: the flag, then the shared registry.

    No fixed relative path, because developers do not lay their machines out
    the same way. Returns None when there is nothing usable to read.
    """
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        return candidate if (candidate / 'todo.csv').exists() else None

    registry = Path(__file__).resolve().parent.parent / 'doxa-repos' / 'repos.py'
    if registry.exists():
        sys.path.insert(0, str(registry.parent))
        try:
            import repos
            recorded = repos.load().get('people-groups')
            if recorded:
                ok, detail = repos.check('people-groups', recorded)
                if ok:
                    return Path(detail)
        except Exception:
            pass
    return None


def next_step(pg, todo_row, repo_dir):
    """Return the next required step for a PG, or None if fully done."""
    slug = pg.get('slug')
    if not slug:
        return None

    findings_path = repo_dir / 'research' / 'findings' / f'{slug}.md'
    prompts_path = repo_dir / 'day-in-the-life' / 'prompts' / f'{slug}.csv'

    research_local = findings_path.exists()
    prompts_local = prompts_path.exists()

    todo = todo_row or {}
    research_todo_done = todo.get('research_done') == 'yes'
    prompts_todo_done = todo.get('prompts_done') == 'yes'
    reviewed_todo_done = todo.get('reviewed') == 'yes'
    upload_todo_done = todo.get('upload_done') == 'yes'

    if pg.get('prompts_pending'):
        if not (research_local or research_todo_done):
            return 'RESEARCH'
        if not (prompts_local or prompts_todo_done):
            return 'PROMPTS'
        if not reviewed_todo_done:
            return 'REVIEW'
        if not upload_todo_done:
            return 'UPLOAD'

    if pg.get('translation_pending_locales'):
        return 'TRANSLATE'

    if pg.get('needs_tags'):
        return 'NEEDS_TAG'

    return None


# ---------------------------------------------------------------------------
# Which server
# ---------------------------------------------------------------------------
TARGETS = {
    'local': 'http://localhost:3000',
    'prod': 'https://pray.doxa.life',
}


def add_target_args(parser):
    """Register --target / --base-url. Deliberately without a default.

    This script reads and writes real people group records. A default is a
    guess about which environment was meant, and a wrong guess either edits
    production or silently does nothing useful against a development database.
    """
    group = parser.add_argument_group('which server')
    group.add_argument('--target', choices=sorted(TARGETS),
                       help="local (%s) or prod (%s)" % (TARGETS['local'], TARGETS['prod']))
    group.add_argument('--base-url', help='an explicit host, for staging or another environment')


def resolve_target(parser, args):
    """The base URL for this run, announced so it is visible in the transcript."""
    if args.target and args.base_url:
        parser.error('pass --target or --base-url, not both')
    base_url = args.base_url or TARGETS.get(args.target or '')
    if not base_url:
        parser.error('say which server this run is for: --target local, --target prod, or --base-url URL')
    base_url = base_url.rstrip('/')
    label = 'PRODUCTION' if base_url == TARGETS['prod'] else (args.target or 'custom')
    print(f'Target: {label}  {base_url}', file=sys.stderr)
    return base_url


# ---------------------------------------------------------------------------
# The admin API key
# ---------------------------------------------------------------------------
KEY_VARS = {
    'prod': 'PRODUCTION_ADMIN_API_KEY',
    'local': 'ADMIN_API_KEY',
}


def read_env_file(name):
    """One variable out of the repository's .env, without loading the rest."""
    env_path = Path(__file__).resolve().parents[3] / '.env'
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding='utf-8', errors='replace').splitlines():
        line = line.strip()
        if line.startswith('export '):
            line = line[len('export '):].lstrip()
        key, sep, value = line.partition('=')
        if not sep or key.strip() != name:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        return value or None
    return None


def resolve_api_key(parser, args):
    """The key for this target: the flag, then the process environment, then .env.

    The variable is named per target, so a development key is never sent to
    production and the production key is never spent on localhost. Only the
    source is announced; the key itself stays out of the transcript.
    """
    if args.api_key:
        print('Admin key: --api-key', file=sys.stderr)
        return args.api_key

    var = KEY_VARS['prod'] if args.base_url == TARGETS['prod'] else KEY_VARS['local']
    for source, value in (('environment', os.environ.get(var)), ('.env', read_env_file(var))):
        if value:
            print(f'Admin key: {var} ({source})', file=sys.stderr)
            return value

    parser.error(f'no admin API key for this target: set {var} in .env, or pass --api-key')


def main():
    parser = argparse.ArgumentParser(description='Task-progresser discovery: list outstanding onboarding work')
    parser.add_argument('--api-key', default=None,
                        help="Admin API key (dxk_*); default: this target's key from .env")
    add_target_args(parser)
    parser.add_argument('--repo', default=None, help='Path to the people-groups repo root (default: the doxa-repos registry)')
    parser.add_argument('--limit', type=int, default=0, help='Cap output rows (0 = no limit)')
    parser.add_argument('--json', action='store_true', help='Output raw JSON list')
    args = parser.parse_args()
    args.base_url = resolve_target(parser, args)
    args.api_key = resolve_api_key(parser, args)

    repo_dir = resolve_repo(args.repo)
    if repo_dir is None:
        print(
            'ERROR: no people-groups checkout. Pass --repo PATH, or register it once:\n'
            '  python3 .claude/skills/doxa-repos/repos.py set people-groups /path/to/checkout\n'
            '  (clone from https://github.com/doxa-life/people-groups)',
            file=sys.stderr,
        )
        sys.exit(1)

    todo_path = repo_dir / 'todo.csv'
    todo_map = load_todo(todo_path)

    try:
        data = api_get(args.base_url, '/api/admin/people-groups/onboarding-status', args.api_key)
    except urllib.error.HTTPError as e:
        print(f"ERROR: HTTP {e.code} fetching onboarding-status: {e.read().decode('utf-8', errors='replace')[:300]}", file=sys.stderr)
        sys.exit(1)

    rows = []
    for pg in data.get('peopleGroups', []):
        step = next_step(pg, todo_map.get(pg.get('slug')), repo_dir)
        if not step:
            continue
        rows.append({
            'id': pg['id'],
            'slug': pg.get('slug'),
            'name': pg.get('name'),
            'country': pg.get('country_code'),
            'next_step': step,
            'translation_pending_locales': pg.get('translation_pending_locales') or [],
            'needs_tags': pg.get('needs_tags') or [],
        })

    if args.limit and len(rows) > args.limit:
        rows = rows[:args.limit]

    if args.json:
        print(json.dumps(rows, indent=2))
        return

    if not rows:
        print("No outstanding onboarding work found.")
        return

    step_order = {'RESEARCH': 0, 'PROMPTS': 1, 'REVIEW': 2, 'UPLOAD': 3, 'TRANSLATE': 4, 'NEEDS_TAG': 5}
    rows.sort(key=lambda r: (step_order.get(r['next_step'], 99), r['name'] or ''))

    print(f"{'STEP':<10} {'COUNTRY':<8} {'NAME':<40} SLUG / DETAIL")
    for r in rows:
        detail = ''
        if r['next_step'] == 'TRANSLATE':
            detail = f"locales: {', '.join(r['translation_pending_locales'])}"
        elif r['next_step'] == 'NEEDS_TAG':
            detail = f"tags: {', '.join(r['needs_tags'])}"
        else:
            detail = r['slug'] or ''
        print(f"{r['next_step']:<10} {(r['country'] or '—'):<8} {(r['name'] or '')[:40]:<40} {detail}")

    print(f"\nTotal outstanding: {len(rows)}")


if __name__ == '__main__':
    main()
