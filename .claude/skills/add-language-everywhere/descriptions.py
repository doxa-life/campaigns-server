#!/usr/bin/env python3
"""Export people-group descriptions for translation, and save the translations back.

    D=.claude/skills/add-language-everywhere/descriptions.py
    python3 $D --target prod export CODE --out FILE     # distinct English phrases still missing CODE, as JSONL
    python3 $D --target prod import CODE --file FILE    # save the translated phrases to every group using them

Descriptions repeat heavily ("a community of India"), so the export holds each
distinct English phrase once: {"en", "groups", "example"}. The file handed to
`import` has the same lines with a "text" field holding the translation. Saving
rereads each group and merges only CODE into its descriptions, because a write
replaces the whole object. Groups that already have CODE are left alone.
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SKILLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILLS / 'doxa-context'))
from doxa_context import (  # noqa: E402
    REPO_ROOT, ApiError, Client, add_target_args, resolve_api_key, resolve_target
)

API = '/api/admin/people-groups'
PAGE = 500
WORKERS = 8


def all_groups(client):
    groups, offset = [], 0
    while True:
        data = client.call('GET', f'{API}?limit={PAGE}&offset={offset}')
        page = data.get('peopleGroups', [])
        groups.extend(page)
        if len(page) < PAGE:
            return groups
        offset += PAGE


def english(group):
    return ((group.get('descriptions') or {}).get('en') or '').strip()


def carriers(code):
    """The sentences a description is dropped into, so a translation reads as their predicate."""
    path = REPO_ROOT / 'i18n' / 'locales' / code / 'people-groups.json'
    try:
        templates = json.loads(path.read_text(encoding='utf-8'))['peopleGroups']['descriptionTemplates']
    except (OSError, KeyError, ValueError):
        return None
    return {key: templates[key] for key in ('peopleDesc', 'peopleDescWithAltNames') if key in templates}


def missing(groups, code):
    return [g for g in groups if english(g) and not ((g.get('descriptions') or {}).get(code) or '').strip()]


def cmd_export(client, args):
    phrases = {}
    for g in missing(all_groups(client), args.code):
        entry = phrases.setdefault(english(g), {'en': english(g), 'groups': 0, 'example': g['name']})
        entry['groups'] += 1
    with open(args.out, 'w', encoding='utf-8') as handle:
        for entry in sorted(phrases.values(), key=lambda e: e['en']):
            handle.write(json.dumps(entry, ensure_ascii=False) + '\n')
    total = sum(e['groups'] for e in phrases.values())
    print(f'{total} groups missing {args.code}: {len(phrases)} distinct phrases -> {args.out}')
    found = carriers(args.code)
    if found:
        print('Carrier sentences (translate each description as the {peopleDesc} predicate):')
        for key, sentence in found.items():
            print(f'  {key}: {sentence}')
    else:
        print(f'No descriptionTemplates in i18n/locales/{args.code}/people-groups.json: '
              f'run the campaigns-server step first', file=sys.stderr)
    return 0


def save_one(client, code, group_id, translations):
    group = client.call('GET', f'{API}/{group_id}')['peopleGroup']
    descriptions = dict(group.get('descriptions') or {})
    text = translations.get((descriptions.get('en') or '').strip())
    if not text or (descriptions.get(code) or '').strip():
        return 'unchanged'
    descriptions[code] = text
    client.call('PUT', f'{API}/{group_id}', {'descriptions': descriptions})
    return 'saved'


def cmd_import(client, args):
    translations = {}
    for number, line in enumerate(Path(args.file).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not all(isinstance(row.get(k), str) and row[k].strip() for k in ('en', 'text')):
            print(f'line {number}: needs en and a non-empty text', file=sys.stderr)
            return 1
        translations[row['en'].strip()] = row['text'].strip()

    targets = [g for g in missing(all_groups(client), args.code) if english(g) in translations]
    counts = {'saved': 0, 'unchanged': 0, 'error': 0}
    errors = []

    def work(group):
        try:
            return group, save_one(client, args.code, group['id'], translations)
        except ApiError as e:
            if e.status in (401, 403):
                raise
            return group, f'error: HTTP {e.status} {e.message}'

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for group, outcome in pool.map(work, targets):
            if outcome.startswith('error'):
                counts['error'] += 1
                errors.append(f"{group['id']} {group['name']}: {outcome}")
            else:
                counts[outcome] += 1

    remaining = len(missing(all_groups(client), args.code))
    print(f"{args.code}: {counts['saved']} groups saved, {counts['unchanged']} changed meanwhile and left alone, "
          f"{counts['error']} errors; {remaining} groups still without {args.code}")
    for line in errors[:20]:
        print(f'  {line}', file=sys.stderr)
    return 1 if counts['error'] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_target_args(parser)
    parser.add_argument('--api-key', help='one-off key instead of the .env variable')
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('export')
    p.add_argument('code')
    p.add_argument('--out', required=True)

    p = sub.add_parser('import')
    p.add_argument('code')
    p.add_argument('--file', required=True)

    args = parser.parse_args()
    base_url = resolve_target(parser, args)
    client = Client(base_url, resolve_api_key(parser, args, base_url))
    try:
        return cmd_export(client, args) if args.command == 'export' else cmd_import(client, args)
    except ApiError as e:
        print(f'HTTP {e.status}: {e.message}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
