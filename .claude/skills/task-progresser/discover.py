#!/usr/bin/env python3
"""
Task-progresser discovery — print the next people group(s) needing onboarding work.

Reads:
  - GET /api/admin/people-groups/onboarding-status (server truth)
  - ../people-groups/dinl/todo.csv (local truth: research_done / prompts_done / upload_done)
  - Local existence of dinl/people-group-findings/{slug}.md and dinl/prompts/{slug}.csv

Prints one row per PG with outstanding work, listing what step comes next:
  RESEARCH | PROMPTS | UPLOAD | TRANSLATE | NEEDS_TAG

Usage:
  python3 .claude/skills/task-progresser/discover.py --api-key KEY [--base-url URL] [--dinl PATH] [--limit N]
"""

import argparse
import csv
import json
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
    """Return dict[slug] -> dict with research_done/prompts_done/upload_done."""
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
        }
    return result


def next_step(pg, todo_row, dinl_dir):
    """Return the next required step for a PG, or None if fully done."""
    slug = pg.get('slug')
    if not slug:
        return None

    findings_path = dinl_dir / 'people-group-findings' / f'{slug}.md'
    prompts_path = dinl_dir / 'prompts' / f'{slug}.csv'

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


def main():
    parser = argparse.ArgumentParser(description='Task-progresser discovery: list outstanding onboarding work')
    parser.add_argument('--api-key', required=True, help='Admin API key (dxk_*)')
    parser.add_argument('--base-url', default='http://localhost:3000', help='API base URL')
    parser.add_argument('--dinl', default=None, help='Path to people-groups/dinl directory (default: auto-detect)')
    parser.add_argument('--limit', type=int, default=0, help='Cap output rows (0 = no limit)')
    parser.add_argument('--json', action='store_true', help='Output raw JSON list')
    args = parser.parse_args()

    if args.dinl:
        dinl_dir = Path(args.dinl)
    else:
        dinl_dir = Path(__file__).parent.parent.parent.parent.parent / 'people-groups' / 'dinl'

    todo_path = dinl_dir / 'todo.csv'
    todo_map = load_todo(todo_path)

    try:
        data = api_get(args.base_url, '/api/admin/people-groups/onboarding-status', args.api_key)
    except urllib.error.HTTPError as e:
        print(f"ERROR: HTTP {e.code} fetching onboarding-status: {e.read().decode('utf-8', errors='replace')[:300]}", file=sys.stderr)
        sys.exit(1)

    rows = []
    for pg in data.get('peopleGroups', []):
        step = next_step(pg, todo_map.get(pg.get('slug')), dinl_dir)
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
