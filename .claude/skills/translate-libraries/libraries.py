#!/usr/bin/env python3
"""Translate the shared prayer libraries into one language, with Claude doing the translating.

    L=.claude/skills/translate-libraries/libraries.py
    python3 $L --target prod check CODE                  # can the server save CODE with its own verses?
    python3 $L --target prod export CODE --out FILE      # English days that lack CODE, as text segments
    python3 $L --target prod import CODE --file FILE     # save the translated segments, then fetch verses

A day is a Tiptap document. The export lists its text segments in document
order, leaving out verse blocks, which are never translated: the server fetches
them from the language's Bible edition. Each line is
{"library_id", "library", "day_number", "segments"}; the file handed to
`import` adds "translated", a list of the same length.

Saving builds the day from the English document with the translated segments in
place, creates it, then asks the server to reconcile its verses, which fetches
each verse block from CODE's Bible without calling a translation model. A day
that already has CODE, or whose English changed since the export, is left alone.
"""

import argparse
import copy
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SKILLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILLS / 'doxa-context'))
from doxa_context import (  # noqa: E402
    UA, ApiError, Client, add_target_args, resolve_api_key, resolve_target
)

API = '/api/admin/libraries'
WORKERS = 4


def as_doc(value):
    return json.loads(value) if isinstance(value, str) else value


def segments(node):
    """Text nodes in document order, skipping verse blocks, as the server's extractTexts does."""
    if not node or node.get('type') == 'verse':
        return []
    found = [node['text']] if node.get('type') == 'text' and node.get('text') else []
    for child in node.get('content') or []:
        found += segments(child)
    return found


def fill(node, texts):
    """Write texts back into the text nodes, in the order segments() read them."""
    if not node or node.get('type') == 'verse':
        return
    if node.get('type') == 'text' and node.get('text'):
        node['text'] = texts.pop(0)
    for child in node.get('content') or []:
        fill(child, texts)


def verse_labels(node):
    if not node:
        return []
    if node.get('type') == 'verse':
        return [(node.get('attrs') or {}).get('translation')]
    return [label for child in node.get('content') or [] for label in verse_labels(child)]


def deployed_language(base_url, code):
    """CODE's entry in the server's deployed config/languages.ts, or None."""
    request = urllib.request.Request(f'{base_url}/api/languages', headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            languages = json.loads(response.read()).get('languages', [])
    except (urllib.error.URLError, ValueError):
        return None
    return next((lang for lang in languages if lang.get('code') == code), None)


def shared_libraries(client):
    return [lib for lib in client.call('GET', API)['libraries'] if lib.get('type') == 'static' and lib['id'] > 0]


def cmd_check(base_url, code):
    language = deployed_language(base_url, code)
    if not language:
        print(f'{code} is not in the deployed config/languages.ts on {base_url}: deploy the campaigns-server '
              f'change first, or verses would be saved in English', file=sys.stderr)
        return 1
    if not language.get('bible_id'):
        print(f'{code} has no Bible edition on {base_url}: verse blocks cannot be fetched', file=sys.stderr)
        return 1
    print(f"ok: {code} is deployed with Bible {language['bible_label']}")
    return 0


def cmd_export(client, args):
    rows, days_total = [], 0
    for library in shared_libraries(client):
        content = client.call('GET', f"{API}/{library['id']}/export")['content']
        have = {item['day_number'] for item in content if item['language_code'] == args.code}
        for item in sorted(content, key=lambda i: i['day_number']):
            if item['language_code'] != 'en' or item['day_number'] in have or not item.get('content_json'):
                continue
            rows.append({
                'library_id': library['id'],
                'library': library['name'],
                'day_number': item['day_number'],
                'segments': segments(as_doc(item['content_json']))
            })
        days_total += sum(1 for item in content if item['language_code'] == 'en')
    with open(args.out, 'w', encoding='utf-8') as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + '\n')
    chars = sum(len(s) for row in rows for s in row['segments'])
    print(f'{len(rows)} of {days_total} English days lack {args.code} '
          f'({sum(len(r["segments"]) for r in rows)} segments, {chars} characters) -> {args.out}')
    return 0


def day_items(client, library_id, day_number):
    items = client.call('GET', f'{API}/{library_id}/content/day/{day_number}')['content']
    return {item['language_code']: item for item in items}


def save_day(client, code, bible_label, row):
    items = day_items(client, row['library_id'], row['day_number'])
    english = items.get('en')
    if code in items:
        return 'exists'
    if not english or segments(as_doc(english['content_json'])) != row['segments']:
        return 'stale'

    doc = copy.deepcopy(as_doc(english['content_json']))
    fill(doc, list(row['translated']))
    client.call('POST', f"{API}/{row['library_id']}/content",
                {'day_number': row['day_number'], 'language_code': code, 'content_json': doc})
    client.call('POST', f"{API}/{row['library_id']}/content/{english['id']}/translate",
                {'source_language': 'en', 'target_languages': [code], 'overwrite': False, 'retranslate_verses': True})

    saved = as_doc(day_items(client, row['library_id'], row['day_number'])[code]['content_json'])
    if any(label != bible_label for label in verse_labels(saved)):
        return 'verse-warning'
    return 'saved'


def cmd_import(client, args, base_url):
    language = deployed_language(base_url, args.code)
    if not language or not language.get('bible_id'):
        return cmd_check(base_url, args.code)

    rows = []
    for number, line in enumerate(Path(args.file).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        translated = row.get('translated')
        if not isinstance(translated, list) or len(translated) != len(row.get('segments', [])) \
                or not all(isinstance(t, str) for t in translated):
            print(f'line {number}: "translated" must be a list of strings as long as "segments"', file=sys.stderr)
            return 1
        rows.append(row)

    counts = {'saved': 0, 'exists': 0, 'stale': 0, 'verse-warning': 0, 'error': 0}
    problems = []

    def work(row):
        try:
            return row, save_day(client, args.code, language['bible_label'], row)
        except ApiError as e:
            if e.status in (401, 403):
                raise
            return row, f'error: HTTP {e.status} {e.message}'

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for row, outcome in pool.map(work, rows):
            key = 'error' if outcome.startswith('error') else outcome
            counts[key] += 1
            if key in ('error', 'verse-warning', 'stale'):
                problems.append(f"{row['library']} day {row['day_number']}: {outcome}")

    print(f"{args.code}: {counts['saved']} days saved, {counts['exists']} already there, "
          f"{counts['stale']} skipped (English changed since export), "
          f"{counts['verse-warning']} saved with a verse not in {language['bible_label']}, {counts['error']} errors")
    for line in problems[:30]:
        print(f'  {line}', file=sys.stderr)
    return 1 if counts['error'] or counts['verse-warning'] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_target_args(parser)
    parser.add_argument('--api-key', help='one-off key instead of the .env variable')
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('check')
    p.add_argument('code')

    p = sub.add_parser('export')
    p.add_argument('code')
    p.add_argument('--out', required=True)

    p = sub.add_parser('import')
    p.add_argument('code')
    p.add_argument('--file', required=True)

    args = parser.parse_args()
    base_url = resolve_target(parser, args)
    if args.command == 'check':
        return cmd_check(base_url, args.code)

    client = Client(base_url, resolve_api_key(parser, args, base_url))
    try:
        if args.command == 'export':
            return cmd_export(client, args)
        return cmd_import(client, args, base_url)
    except ApiError as e:
        print(f'HTTP {e.status}: {e.message}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
