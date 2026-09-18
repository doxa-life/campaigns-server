#!/usr/bin/env python3
"""Where this developer keeps the other DOXA checkouts.

The language skills span five repositories. Nothing committed may name a path,
because every developer lays their machine out differently, so the paths live in
an untracked registry beside this script and are asked for once.

    python3 .claude/skills/doxa-repos/repos.py list
    python3 .claude/skills/doxa-repos/repos.py set marketing /path/to/checkout
    python3 .claude/skills/doxa-repos/repos.py path mobile
    python3 .claude/skills/doxa-repos/repos.py forget pipeline

`list` exits non-zero when a repository is missing or the recorded path is no
longer that repository, so a skill can stop and ask instead of silently
skipping a surface.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

REGISTRY = Path(__file__).resolve().parent.parent.parent / "doxa-repos.json"

# Keyed by the short name the skills use. `remote` is matched against the
# checkout's origin so a mistyped path is caught when it is recorded rather
# than halfway through a language pass.
REPOS = {
    "marketing": {
        "remote": "doxa-life/doxa-life",
        "title": "Marketing site (doxa.life)",
        "url": "https://github.com/doxa-life/doxa-life",
    },
    "mobile": {
        "remote": "doxa-life/doxa-prayer-mobile-app",
        "title": "Mobile app (Doxa Prayer)",
        "url": "https://github.com/doxa-life/doxa-prayer-mobile-app",
    },
    "pipeline": {
        "remote": "doxa-life/doxa-resource-pipeline",
        "title": "Adoption resource pipeline",
        "url": "https://github.com/doxa-life/doxa-resource-pipeline",
    },
    "people-groups": {
        "remote": "doxa-life/people-groups",
        "title": "People group research and Day in the Life prompts",
        "url": "https://github.com/doxa-life/people-groups",
    },
}


def load() -> dict:
    if not REGISTRY.exists():
        return {}
    try:
        return json.loads(REGISTRY.read_text())
    except json.JSONDecodeError:
        print(f"! {REGISTRY} is not valid JSON; treating it as empty", file=sys.stderr)
        return {}


def save(data: dict) -> None:
    REGISTRY.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def origin_of(path: Path) -> str:
    """The checkout's origin as `owner/name`, or '' when it is not a git repo."""
    try:
        remote = subprocess.run(
            ["git", "-C", str(path), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    if remote.returncode != 0:
        return ""
    url = remote.stdout.strip().removesuffix(".git")
    for separator in (":", "/"):
        parts = url.split(separator)
        if len(parts) >= 2:
            url = "/".join(parts[-2:])
    return url


def check(key: str, raw_path: str) -> tuple[bool, str]:
    # Resolved, because the registry is read from whichever directory a skill
    # happens to run in and a relative path would resolve differently there.
    path = Path(raw_path).expanduser().resolve()
    if not path.is_dir():
        return False, "no such directory"
    origin = origin_of(path)
    if not origin:
        return False, "not a git checkout"
    if origin != REPOS[key]["remote"]:
        return False, f"origin is {origin}"
    return True, str(path)


def cmd_list(args: argparse.Namespace) -> int:
    data = load()
    missing = []
    for key, repo in REPOS.items():
        recorded = data.get(key)
        if not recorded:
            missing.append(key)
            print(f"{key:<15} MISSING      {repo['url']}")
            continue
        ok, detail = check(key, recorded)
        if ok:
            print(f"{key:<15} ok           {detail}")
        else:
            missing.append(key)
            print(f"{key:<15} UNUSABLE     {recorded} ({detail})")

    if missing:
        print()
        print("Ask for a checkout path for: " + ", ".join(missing))
        print(f"Record each with: python3 {Path(__file__).name} set <name> <path>")
        return 1
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    if args.name not in REPOS:
        print(f"Unknown repository '{args.name}'. Known: {', '.join(REPOS)}", file=sys.stderr)
        return 2

    ok, detail = check(args.name, args.path)
    if not ok:
        print(f"Cannot use {args.path}: {detail}", file=sys.stderr)
        print(f"Expected a checkout of {REPOS[args.name]['url']}", file=sys.stderr)
        return 1

    data = load()
    data[args.name] = detail
    save(data)
    print(f"{args.name} -> {detail}")
    return 0


def cmd_path(args: argparse.Namespace) -> int:
    recorded = load().get(args.name)
    if not recorded:
        print(f"No path recorded for '{args.name}'", file=sys.stderr)
        return 1
    ok, detail = check(args.name, recorded)
    if not ok:
        print(f"Recorded path for '{args.name}' is unusable: {detail}", file=sys.stderr)
        return 1
    print(detail)
    return 0


def cmd_forget(args: argparse.Namespace) -> int:
    data = load()
    if data.pop(args.name, None) is None:
        print(f"Nothing recorded for '{args.name}'")
        return 0
    save(data)
    print(f"Forgot {args.name}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="show every repository and whether its path is usable")

    setter = sub.add_parser("set", help="record where a repository is checked out")
    setter.add_argument("name", choices=sorted(REPOS))
    setter.add_argument("path")

    getter = sub.add_parser("path", help="print one repository's path")
    getter.add_argument("name", choices=sorted(REPOS))

    forgetter = sub.add_parser("forget", help="drop a recorded path")
    forgetter.add_argument("name", choices=sorted(REPOS))

    args = parser.parse_args()
    return {"list": cmd_list, "set": cmd_set, "path": cmd_path, "forget": cmd_forget}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
