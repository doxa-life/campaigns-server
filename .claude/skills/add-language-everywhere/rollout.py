#!/usr/bin/env python3
"""Report a language rollout's progress to /admin/onboarding (Languages tab).

    R=.claude/skills/add-language-everywhere/rollout.py
    python3 $R --target prod check                               # is the key set up, does it authenticate
    python3 $R --target prod start CODE                          # show the language on the page
    python3 $R --target prod task CODE KEY STATE [--note TEXT]   # STATE: pending|running|done|failed|skipped
    python3 $R --target prod report CODE                         # run language-status and store the result
    python3 $R --target prod show CODE
    python3 $R --target prod wait-live CODE --site campaigns|marketing [--timeout 900]

Task keys and labels live in config/language-rollout-tasks.ts. The admin key is
read from .env exactly as the doxa-context helper reads it.
"""

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SKILLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILLS / 'doxa-context'))
from doxa_context import (  # noqa: E402
    PROFILE_PATH, REPO_ROOT, UA, ApiError, Client, add_target_args, find_api_key,
    key_var_for, resolve_api_key, resolve_target, setup_instructions
)

API = '/api/admin/language-rollouts'
NOT_DEPLOYED = ('the server answered without JSON: it does not have the language-rollouts API, '
                'so the code behind /admin/onboarding is not deployed there yet')
STATES = ['pending', 'running', 'done', 'failed', 'skipped']
MARKS = {'pending': ' ', 'running': '~', 'done': 'x', 'failed': '!', 'skipped': '-'}


def q(part):
    return urllib.parse.quote(str(part), safe='')


def print_rollout(rollout):
    print(f"{rollout['name_en']} ({rollout['code']}): {rollout['done_count']}/{rollout['total_count']} done")
    for task in rollout['tasks']:
        extra = ''
        if task.get('progress'):
            extra = f" {task['progress']['done']}/{task['progress']['total']}"
        if task.get('note'):
            extra += f" — {task['note']}"
        print(f"  [{MARKS.get(task['state'], '?')}] {task['key']:<26} {task['label']}{extra}")


def http_get(url):
    """(status, body) for a plain GET; status 0 when the server cannot be reached."""
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, b''
    except (urllib.error.URLError, TimeoutError):
        return 0, b''


def is_live(site, code, base_url, marketing_url):
    """Whether the deployed site serves CODE switched on."""
    if site == 'campaigns':
        status, body = http_get(f'{base_url}/api/languages')
        try:
            languages = json.loads(body).get('languages', []) if status == 200 else []
        except ValueError:
            return False
        return any(lang.get('code') == code and lang.get('enabled') for lang in languages)
    status, _ = http_get(f'{marketing_url}/{code}/')
    return status == 200


def cmd_wait_live(args, base_url):
    """Poll until the pushed change is deployed and serving the language."""
    url = base_url if args.site == 'campaigns' else args.marketing_url
    deadline = time.time() + args.timeout
    while True:
        if is_live(args.site, args.code, base_url, args.marketing_url):
            print(f'live: {url} serves {args.code}')
            return 0
        if time.time() >= deadline:
            print(f'not live after {args.timeout}s: {url} does not serve {args.code} yet', file=sys.stderr)
            return 1
        time.sleep(30)


def cmd_check(args, base_url):
    """Exit 0 only when the key is configured and the server accepts it for rollouts."""
    key, var, source = find_api_key(args, base_url)
    if not key:
        print(setup_instructions(var, base_url), file=sys.stderr)
        return 2
    print(f'Admin key: {var} ({source})' if var else 'Admin key: --api-key', file=sys.stderr)
    try:
        Client(base_url, key).call('GET', API)
    except ApiError as e:
        if e.status == 401:
            var = var or key_var_for(base_url)
            print(f'HTTP 401: the key is not accepted: it is missing, revoked, or was issued for another server.\n'
                  f'Create a new one at {base_url}{PROFILE_PATH} and update {var} in .env.', file=sys.stderr)
        elif e.status == 403:
            print(f'HTTP 403: {e.message}. The key needs glossary.view, glossary.manage and people_groups.edit.', file=sys.stderr)
        else:
            print(f'HTTP {e.status}: {e.message}', file=sys.stderr)
        return 1
    except ValueError:
        print(NOT_DEPLOYED, file=sys.stderr)
        return 1
    print('ok: key authenticates for language rollouts')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_target_args(parser)
    parser.add_argument('--api-key', help='one-off key instead of the .env variable')
    sub = parser.add_subparsers(dest='command', required=True)

    sub.add_parser('check')

    p = sub.add_parser('start')
    p.add_argument('code')

    p = sub.add_parser('task')
    p.add_argument('code')
    p.add_argument('key')
    p.add_argument('state', choices=STATES)
    p.add_argument('--note', default='')

    p = sub.add_parser('report')
    p.add_argument('code')

    p = sub.add_parser('show')
    p.add_argument('code')

    p = sub.add_parser('wait-live')
    p.add_argument('code')
    p.add_argument('--site', choices=['campaigns', 'marketing'], required=True)
    p.add_argument('--timeout', type=int, default=900, help='seconds to wait; a deploy takes 5-10 minutes (default 900)')
    p.add_argument('--marketing-url', default='https://doxa.life')

    args = parser.parse_args()
    base_url = resolve_target(parser, args)
    if args.command == 'check':
        return cmd_check(args, base_url)
    if args.command == 'wait-live':
        return cmd_wait_live(args, base_url)
    client = Client(base_url, resolve_api_key(parser, args, base_url))

    try:
        if args.command == 'start':
            data = client.call('POST', API, {'code': args.code})
        elif args.command == 'task':
            data = client.call('PUT', f'{API}/{q(args.code)}/tasks/{q(args.key)}',
                               {'state': args.state, 'note': args.note})
        elif args.command == 'report':
            survey = subprocess.run(
                [sys.executable, str(SKILLS / 'language-status' / 'language_status.py'),
                 args.code, '--base-url', base_url, '--json'],
                cwd=REPO_ROOT, capture_output=True, text=True, check=True
            )
            data = client.call('PUT', f'{API}/{q(args.code)}/status-report', {'report': json.loads(survey.stdout)})
        else:
            data = client.call('GET', f'{API}/{q(args.code)}')
    except ApiError as e:
        print(f'HTTP {e.status}: {e.message}', file=sys.stderr)
        return 1
    except ValueError:
        print(NOT_DEPLOYED, file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as e:
        print(f'language-status failed: {e.stderr.strip()}', file=sys.stderr)
        return 1

    print_rollout(data['rollout'])
    print(f"{base_url}/admin/onboarding?tab=languages")
    return 0


if __name__ == '__main__':
    sys.exit(main())
