#!/usr/bin/env python3
"""Create, read, update and delete context portfolios and their sections.

A context portfolio is one body of organizational knowledge held as markdown
sections on a campaigns server. It is edited in the browser at /admin/context
and through the same REST API this script calls with an admin API key.

    S=.claude/skills/doxa-context/doxa_context.py
    python3 $S --target prod check                  # is the key set up, does it authenticate
    python3 $S --target prod catalog                # built-in section keys and titles
    python3 $S --target prod portfolios
    python3 $S --target prod portfolio SLUG
    python3 $S --target prod create-portfolio --name NAME [--slug SLUG] [--color HEX] [--sections k1,k2 | --no-sections]
    python3 $S --target prod update-portfolio SLUG [--name NAME] [--color HEX | --clear-color]
    python3 $S --target prod delete-portfolio SLUG --yes
    python3 $S --target prod sections SLUG
    python3 $S --target prod add-section SLUG --key KEY
    python3 $S --target prod add-section SLUG --title TITLE [--description TEXT] [--order N]
    python3 $S --target prod update-section SLUG KEY [--title TITLE] [--description TEXT] [--order N]
    python3 $S --target prod reorder SLUG KEY [KEY ...]
    python3 $S --target prod remove-section SLUG KEY --yes
    python3 $S --target prod get SLUG KEY [--out FILE]
    python3 $S --target prod put SLUG KEY --file FILE
    python3 $S --target prod versions SLUG KEY
    python3 $S --target prod restore SLUG KEY VERSION_ID
    python3 $S --target prod dump SLUG --dir DIR

`--target` has no default. The admin key is read from .env per target
(PRODUCTION_ADMIN_API_KEY for prod, ADMIN_API_KEY for local) and only the
variable's name is ever printed. `--json` prints the server's response as is.
Errors print the HTTP status and the server's message and exit non-zero.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOG_FILE = REPO_ROOT / 'config' / 'context-sections.ts'

TARGETS = {
    'local': 'http://localhost:3000',
    'prod': 'https://pray.doxa.life',
}
KEY_VARS = {
    'prod': 'PRODUCTION_ADMIN_API_KEY',
    'local': 'ADMIN_API_KEY',
}
PROFILE_PATH = '/admin/profile'
API = '/api/admin/context/portfolios'
# Cloudflare's bot rules in front of the production server reject the default
# Python user agent outright (error 1010), so every request names itself.
UA = 'doxa-context/1.0'


# ---------------------------------------------------------------------------
# Which server
# ---------------------------------------------------------------------------
def add_target_args(parser):
    """Register --target / --base-url without a default: a guessed target
    would edit production or a development database by accident."""
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
def read_env_file(name):
    """One variable out of the repository's .env, without loading the rest."""
    env_path = REPO_ROOT / '.env'
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


def key_var_for(base_url):
    return KEY_VARS['prod'] if base_url == TARGETS['prod'] else KEY_VARS['local']


def find_api_key(args, base_url):
    """(key, variable, source). The key is None when nothing is configured.

    The variable is named per target, so a development key is never sent to
    production and the production key is never spent on localhost.
    """
    if args.api_key:
        return args.api_key, None, '--api-key'
    var = key_var_for(base_url)
    for source, value in (('environment', os.environ.get(var)), ('.env', read_env_file(var))):
        if value:
            return value, var, source
    return None, var, None


def setup_instructions(var, base_url):
    return (
        f'No admin API key for this target: {var} is not set.\n'
        f'\n'
        f'To set it up:\n'
        f'  1. Sign in at {base_url}{PROFILE_PATH} as an admin and create an API key.\n'
        f'     It starts with dxk_ and is shown once.\n'
        f'  2. Add it to .env at the repository root (the file is git-ignored):\n'
        f'       {var}=dxk_...\n'
        f'  3. Run the command again, or pass --api-key for a one-off run.'
    )


def resolve_api_key(parser, args, base_url):
    """Only the source is announced; the key itself stays out of the transcript."""
    key, var, source = find_api_key(args, base_url)
    if key:
        print(f'Admin key: {var} ({source})' if var else 'Admin key: --api-key', file=sys.stderr)
        return key
    parser.exit(2, setup_instructions(var, base_url) + '\n')


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def error_message(payload, fallback):
    text = payload.decode('utf-8', errors='replace').strip() if isinstance(payload, bytes) else str(payload or '')
    try:
        data = json.loads(text)
    except ValueError:
        return text[:300] or str(fallback)
    if isinstance(data, dict):
        for field in ('statusMessage', 'message', 'error'):
            if data.get(field):
                return str(data[field])
    return text[:300] or str(fallback)


class Client:
    def __init__(self, base_url, api_key):
        self.base_url = base_url
        self.api_key = api_key

    def call(self, method, path, body=None, raw=False):
        headers = {'Authorization': f'Bearer {self.api_key}', 'Accept': 'application/json', 'User-Agent': UA}
        data = None
        if body is not None:
            data = json.dumps(body).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = resp.read()
        except urllib.error.HTTPError as e:
            try:
                payload = e.read()
            except OSError:
                payload = b''
            raise ApiError(e.code, error_message(payload, e.reason))
        except urllib.error.URLError as e:
            raise ApiError(0, f'could not reach {self.base_url}: {e.reason}')
        if raw:
            return payload
        return json.loads(payload) if payload else None


def q(part):
    return urllib.parse.quote(str(part), safe='')


def portfolio_path(slug):
    return f'{API}/{q(slug)}'


def section_path(slug, key):
    return f'{portfolio_path(slug)}/sections/{q(key)}'


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def emit(args, data, lines):
    """The raw response with --json, otherwise the human lines."""
    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        for line in lines:
            print(line)


def count_words(content):
    trimmed = (content or '').strip()
    return len(trimmed.split()) if trimmed else 0


def when(value):
    return (value or '')[:16].replace('T', ' ') if value else '-'


def read_input(path):
    if path == '-':
        return sys.stdin.read()
    return Path(path).read_text(encoding='utf-8')


def require_yes(parser, args, what):
    if not args.yes:
        parser.exit(2, f'refusing: pass --yes to {what}\n')


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_check(parser, args, base_url):
    """Report whether a key is configured and whether the server accepts it."""
    key, var, source = find_api_key(args, base_url)
    if not key:
        parser.exit(2, setup_instructions(var, base_url) + '\n')
    print(f'Admin key: {var} ({source})' if var else 'Admin key: --api-key', file=sys.stderr)
    client = Client(base_url, key)
    try:
        data = client.call('GET', API)
    except ApiError as e:
        if e.status == 401:
            hint = (f'The key is not accepted: it is missing, revoked, or was issued for another server.\n'
                    f'Create a new one at {base_url}{PROFILE_PATH} and update {var or "the key"} in .env.')
        elif e.status == 403 and 'Permission required' in e.message:
            hint = ('The key works but its user lacks context.view. Use a key created by a user\n'
                    'whose role grants context.view, context.edit and context.manage (admin).')
        else:
            hint = ''
        parser.exit(1, f'HTTP {e.status}: {e.message}\n{hint}\n'.rstrip() + '\n')
    slugs = [p['slug'] for p in data.get('portfolios', [])]
    emit(args, data, [f'ok: key authenticates; {len(slugs)} portfolio(s): {", ".join(slugs) or "-"}'])


def cmd_catalog(parser, args, base_url):
    """Built-in section keys, from the code-owned catalog in config/."""
    if not CATALOG_FILE.exists():
        parser.exit(1, f'catalog not found: {CATALOG_FILE}\n')
    text = CATALOG_FILE.read_text(encoding='utf-8')
    pattern = re.compile(r"key:\s*'([^']+)',\s*title:\s*'([^']+)',\s*description:\s*'([^']*)'", re.S)
    entries = [{'key': k, 'title': t, 'description': d} for k, t, d in pattern.findall(text)]
    if not entries:
        parser.exit(1, f'could not read section keys out of {CATALOG_FILE}\n')
    emit(args, entries, [f"{e['key']} | {e['title']} | {e['description']}" for e in entries])


def cmd_portfolios(client, args):
    data = client.call('GET', API)
    emit(args, data, [f"{p['slug']} | {p['name']} | {p.get('color') or '-'}" for p in data['portfolios']])


def cmd_portfolio(client, args):
    data = client.call('GET', portfolio_path(args.slug))
    emit(args, data, [
        f"slug: {data['slug']}",
        f"name: {data['name']}",
        f"color: {data.get('color') or '-'}",
        f"icon: {data.get('icon_url') or '-'}",
        f"created: {when(data.get('created_at'))}  updated: {when(data.get('updated_at'))}",
    ])


def cmd_create_portfolio(parser, client, args):
    body = {'name': args.name}
    if args.slug:
        body['slug'] = args.slug
    if args.color:
        body['color'] = args.color
    if args.sections and args.no_sections:
        parser.error('pass --sections or --no-sections, not both')
    if args.no_sections:
        body['builtin_sections'] = []
    elif args.sections:
        body['builtin_sections'] = [k.strip() for k in args.sections.split(',') if k.strip()]
    data = client.call('POST', API, body)
    emit(args, data, [f"created portfolio {data['slug']} ({data['name']})"])


def cmd_update_portfolio(parser, client, args):
    body = {}
    if args.name is not None:
        body['name'] = args.name
    if args.color is not None and args.clear_color:
        parser.error('pass --color or --clear-color, not both')
    if args.clear_color:
        body['color'] = None
    elif args.color is not None:
        body['color'] = args.color
    if not body:
        parser.error('nothing to change: pass --name, --color or --clear-color')
    data = client.call('PATCH', portfolio_path(args.slug), body)
    emit(args, data, [f"updated portfolio {data['slug']}: name={data['name']} color={data.get('color') or '-'}"])


def cmd_delete_portfolio(parser, client, args):
    require_yes(parser, args, f'delete portfolio "{args.slug}" with every section, version, comment and chat in it')
    data = client.call('DELETE', portfolio_path(args.slug))
    emit(args, data, [f'deleted portfolio {args.slug}'])


def cmd_sections(client, args):
    data = client.call('GET', f'{portfolio_path(args.slug)}/sections')
    lines = []
    for s in data['sections']:
        kind = 'custom' if s.get('is_custom') else 'built-in'
        lines.append(f"{s['key']} | {s['title']} | {s['word_count']} words | {when(s.get('last_edited_at'))} | {kind} | {s.get('description') or ''}")
    emit(args, data, lines)


def cmd_add_section(parser, client, args):
    if bool(args.key) == bool(args.title):
        parser.error('pass --key for a built-in section or --title for a custom one')
    if args.key:
        body = {'key': args.key}
    else:
        body = {'title': args.title}
        if args.description is not None:
            body['description'] = args.description
        if args.order is not None:
            body['order'] = args.order
    data = client.call('POST', f'{portfolio_path(args.slug)}/sections', body)
    emit(args, data, [f"added section {data['key']} ({data['title']}) at position {data['order']}"])


def cmd_update_section(parser, client, args):
    body = {}
    if args.title is not None:
        body['title'] = args.title
    if args.description is not None:
        body['description'] = args.description
    if args.order is not None:
        body['order'] = args.order
    if not body:
        parser.error('nothing to change: pass --title, --description or --order')
    data = client.call('PATCH', section_path(args.slug, args.key), body)
    emit(args, data, [f"updated section {data['key']}: title={data['title']} order={data['order']}"])


def cmd_reorder(client, args):
    data = client.call('PUT', f'{portfolio_path(args.slug)}/section-order', {'keys': args.keys})
    emit(args, data, [f"{s['order']}. {s['key']}" for s in data['sections']])


def cmd_remove_section(parser, client, args):
    require_yes(parser, args, f'remove section "{args.key}" from portfolio "{args.slug}"')
    data = client.call('DELETE', section_path(args.slug, args.key))
    kept = 'content kept under the key' if data.get('content_retained') else 'no content to keep'
    emit(args, data, [f"removed section {args.key} ({kept})"])


def cmd_get(client, args):
    data = client.call('GET', section_path(args.slug, args.key))
    if args.json:
        emit(args, data, [])
        return
    content = data.get('content') or ''
    if args.out:
        Path(args.out).write_text(content, encoding='utf-8')
        print(f"wrote {args.out}: {data['title']}, {count_words(content)} words, last edited {when(data.get('last_edited_at'))}", file=sys.stderr)
    else:
        sys.stdout.write(content)
        if content and not content.endswith('\n'):
            sys.stdout.write('\n')


def cmd_put(client, args):
    content = read_input(args.file)
    data = client.call('PUT', section_path(args.slug, args.key), {'content': content})
    emit(args, data, [f"saved section {data['key']}: {count_words(data.get('content'))} words, version {data['version_id']}"])


def cmd_versions(client, args):
    data = client.call('GET', f'{section_path(args.slug, args.key)}/versions')
    lines = []
    for v in data['versions']:
        who = v.get('edited_by_name') or v.get('edited_by') or '-'
        lines.append(f"{v['id']} | {when(v.get('edited_at'))} | {v.get('source') or '-'} | {who} | {count_words(v.get('content'))} words")
    emit(args, data, lines or ['no versions'])


def cmd_restore(client, args):
    data = client.call('POST', f'{section_path(args.slug, args.key)}/versions/{q(args.version_id)}/restore')
    emit(args, data, [f"restored section {data['key']} from {data['restored_from']} as version {data['version_id']}"])


def cmd_dump(client, args):
    out_dir = Path(args.dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    listing = client.call('GET', f'{portfolio_path(args.slug)}/sections')
    lines = []
    for s in listing['sections']:
        section = client.call('GET', section_path(args.slug, s['key']))
        path = out_dir / f"{s['key']}.md"
        path.write_text(section.get('content') or '', encoding='utf-8')
        lines.append(f"{path} | {s['title']} | {s['word_count']} words")
    emit(args, listing, lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def build_parser():
    parser = argparse.ArgumentParser(description='Context portfolios and sections on a campaigns server')
    parser.add_argument('--api-key', default=None,
                        help="Admin API key (dxk_*); default: this target's key from .env")
    parser.add_argument('--json', action='store_true', help="print the server's response as JSON")
    add_target_args(parser)

    sub = parser.add_subparsers(dest='command', required=True)

    sub.add_parser('check', help='is the key set up, does it authenticate')
    sub.add_parser('catalog', help='built-in section keys and titles')
    sub.add_parser('portfolios', help='list portfolios')

    p = sub.add_parser('portfolio', help='show one portfolio')
    p.add_argument('slug')

    p = sub.add_parser('create-portfolio', help='create a portfolio')
    p.add_argument('--name', required=True)
    p.add_argument('--slug', help='lowercase letters, digits and hyphens; derived from the name when omitted')
    p.add_argument('--color', help='e.g. #7c3aed')
    p.add_argument('--sections', help='comma-separated built-in keys to start with; default: every catalog section')
    p.add_argument('--no-sections', action='store_true', help='start with no sections')

    p = sub.add_parser('update-portfolio', help='rename or recolor a portfolio')
    p.add_argument('slug')
    p.add_argument('--name')
    p.add_argument('--color')
    p.add_argument('--clear-color', action='store_true')

    p = sub.add_parser('delete-portfolio', help='delete a portfolio and everything in it')
    p.add_argument('slug')
    p.add_argument('--yes', action='store_true')

    p = sub.add_parser('sections', help="list a portfolio's sections")
    p.add_argument('slug')

    p = sub.add_parser('add-section', help='add a built-in (--key) or custom (--title) section')
    p.add_argument('slug')
    p.add_argument('--key', help='a built-in key from the catalog')
    p.add_argument('--title', help='title of a new custom section; its key is the slugified title')
    p.add_argument('--description')
    p.add_argument('--order', type=int)

    p = sub.add_parser('update-section', help="change a section's title, description or position")
    p.add_argument('slug')
    p.add_argument('key')
    p.add_argument('--title')
    p.add_argument('--description')
    p.add_argument('--order', type=int)

    p = sub.add_parser('reorder', help='set the order of every section; list each key exactly once')
    p.add_argument('slug')
    p.add_argument('keys', nargs='+')

    p = sub.add_parser('remove-section', help='remove a section; its content stays under the key')
    p.add_argument('slug')
    p.add_argument('key')
    p.add_argument('--yes', action='store_true')

    p = sub.add_parser('get', help="print a section's markdown")
    p.add_argument('slug')
    p.add_argument('key')
    p.add_argument('--out', help='write the markdown to this file instead of stdout')

    p = sub.add_parser('put', help="replace a section's markdown")
    p.add_argument('slug')
    p.add_argument('key')
    p.add_argument('--file', required=True, help="markdown file, or '-' for stdin")

    p = sub.add_parser('versions', help='saved versions of a section, newest first')
    p.add_argument('slug')
    p.add_argument('key')

    p = sub.add_parser('restore', help='save an earlier version as the current content')
    p.add_argument('slug')
    p.add_argument('key')
    p.add_argument('version_id')

    p = sub.add_parser('dump', help='write every section of a portfolio as DIR/<key>.md')
    p.add_argument('slug')
    p.add_argument('--dir', required=True)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    base_url = resolve_target(parser, args)

    if args.command == 'check':
        return cmd_check(parser, args, base_url)
    if args.command == 'catalog':
        return cmd_catalog(parser, args, base_url)

    client = Client(base_url, resolve_api_key(parser, args, base_url))
    try:
        if args.command == 'portfolios':
            cmd_portfolios(client, args)
        elif args.command == 'portfolio':
            cmd_portfolio(client, args)
        elif args.command == 'create-portfolio':
            cmd_create_portfolio(parser, client, args)
        elif args.command == 'update-portfolio':
            cmd_update_portfolio(parser, client, args)
        elif args.command == 'delete-portfolio':
            cmd_delete_portfolio(parser, client, args)
        elif args.command == 'sections':
            cmd_sections(client, args)
        elif args.command == 'add-section':
            cmd_add_section(parser, client, args)
        elif args.command == 'update-section':
            cmd_update_section(parser, client, args)
        elif args.command == 'reorder':
            cmd_reorder(client, args)
        elif args.command == 'remove-section':
            cmd_remove_section(parser, client, args)
        elif args.command == 'get':
            cmd_get(client, args)
        elif args.command == 'put':
            cmd_put(client, args)
        elif args.command == 'versions':
            cmd_versions(client, args)
        elif args.command == 'restore':
            cmd_restore(client, args)
        elif args.command == 'dump':
            cmd_dump(client, args)
    except ApiError as e:
        hint = ''
        if e.status == 401:
            hint = f'\nThe key is missing, revoked, or issued for another server. See: {sys.argv[0]} --target ... check'
        elif e.status == 403 and 'Permission required' in e.message:
            hint = '\nThe key\'s user lacks that permission; use a key created by an admin.'
        parser.exit(1, f'HTTP {e.status}: {e.message}{hint}\n')
    except FileNotFoundError as e:
        parser.exit(1, f'{e}\n')


if __name__ == '__main__':
    main()
