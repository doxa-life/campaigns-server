#!/usr/bin/env python3
"""Where one language stands across every DOXA surface.

Answers the question both language skills open with: does this language have a
glossary, is it registered in code, which surfaces carry it, and what is
missing. Every check is a file read or a public HTTP GET, so it is safe to run
at any time and changes nothing.

    python3 .claude/skills/language-status/language_status.py ro
    python3 .claude/skills/language-status/language_status.py ro --json

Run it from the campaigns server checkout. Paths to the other repositories come
from the doxa-repos registry; a repository that is not registered is reported as
unknown rather than guessed at.
"""

import argparse
import csv
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "doxa-repos"))
import repos  # noqa: E402

DEFAULT_BASE_URL = "https://pray.doxa.life"


# ----------------------------------------------------------------- helpers

def fetch_json(url: str, timeout: int = 15):
    request = urllib.request.Request(url, headers={"User-Agent": "doxa-language-status"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def count_leaves(value) -> int:
    """Translatable strings in a locale file, counting nested objects."""
    if isinstance(value, str):
        return 1
    if isinstance(value, dict):
        return sum(count_leaves(item) for item in value.values())
    if isinstance(value, list):
        return sum(count_leaves(item) for item in value)
    return 0


def json_leaf_count(path: Path) -> int | None:
    try:
        return count_leaves(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return None


def arb_key_count(path: Path) -> int | None:
    """Message keys in a Flutter ARB, ignoring the `@key` metadata blocks."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return sum(1 for key in data if not key.startswith("@"))


def language_config_entry(config: Path, code: str) -> dict | None:
    """One language's fields from a `config/languages.ts` LANGUAGES array."""
    try:
        source = config.read_text(encoding="utf-8")
    except OSError:
        return None

    match = re.search(r"\{\s*code:\s*'" + re.escape(code) + r"'.*?\}", source, re.DOTALL)
    if not match:
        return None

    entry = match.group(0)
    fields = {}
    for key in ("name", "nativeName", "bibleId", "bibleLabel", "translationName"):
        found = re.search(key + r":\s*'([^']*)'", entry)
        if found:
            fields[key] = found.group(1)
    fields["enabled"] = "enabled: false" not in entry
    return fields


# ----------------------------------------------------------------- surfaces

def check_glossary(base_url: str, code: str) -> dict:
    result = {"surface": "glossary", "where": base_url}
    try:
        data = fetch_json(f"{base_url}/api/glossary/{code}")
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return {**result, "state": "missing", "detail": "no glossary for this language yet"}
        return {**result, "state": "unknown", "detail": f"HTTP {error.code}"}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        return {**result, "state": "unknown", "detail": str(error)}

    terms = data.get("terms", [])
    confirmed = sum(1 for term in terms if term.get("status") == "confirmed")
    notes = (data.get("notes") or "").strip()
    language = data.get("language", {})
    return {
        **result,
        "state": "present",
        "name_en": language.get("name_en"),
        "name_local": language.get("name_local"),
        "text_direction": language.get("text_direction"),
        "bible_id": language.get("bible_id"),
        "bible_translation": language.get("bible_translation"),
        "term_count": len(terms),
        "confirmed_count": confirmed,
        "has_notes": bool(notes),
        "notes_chars": len(notes),
        "detail": f"{confirmed}/{len(terms)} terms confirmed, "
                  f"{'notes written' if notes else 'no translation notes yet'}",
    }


def check_campaigns_server(root: Path, code: str, glossary: dict) -> dict:
    result = {"surface": "campaigns-server", "where": str(root)}
    entry = language_config_entry(root / "config" / "languages.ts", code)
    if entry is None:
        return {**result, "state": "missing", "detail": "not in config/languages.ts"}

    locales = root / "i18n" / "locales"
    english = {path.name: json_leaf_count(path) for path in sorted((locales / "en").glob("*.json"))}
    mine = {name: json_leaf_count(locales / code / name) for name in english}

    missing_files = [name for name, count in mine.items() if count is None]
    short_files = {
        name: (english[name], mine[name])
        for name in english
        if mine[name] is not None and english[name] and mine[name] < english[name]
    }

    bible_dump = None
    if entry.get("bibleId"):
        bible_dump = (root / "data" / "bibles" / f"{entry['bibleId']}.json").exists()

    detail = []
    detail.append("enabled" if entry["enabled"] else "registered but switched off")
    if missing_files:
        detail.append("missing locale files: " + ", ".join(missing_files))
    elif short_files:
        detail.append("short locale files: " + ", ".join(
            f"{name} {have}/{want}" for name, (want, have) in short_files.items()
        ))
    else:
        detail.append("locale files complete")
    if entry.get("bibleId"):
        detail.append(f"bible {entry['bibleId']}" + ("" if bible_dump else " (no local dump)"))
    else:
        detail.append("no bible edition set")

    # The glossary is where a language's Bible edition is decided, so a code
    # entry that disagrees with it is drift, not a second opinion.
    if glossary.get("state") == "present" and glossary.get("bible_id") and entry.get("bibleId"):
        if glossary["bible_id"] != entry["bibleId"]:
            detail.append(f"DRIFT: glossary says {glossary['bible_id']}")

    return {
        **result,
        "state": "present",
        "enabled": entry["enabled"],
        "name": entry.get("name"),
        "native_name": entry.get("nativeName"),
        "bible_id": entry.get("bibleId"),
        "bible_dump_present": bible_dump,
        "missing_locale_files": missing_files,
        "short_locale_files": {name: list(counts) for name, counts in short_files.items()},
        "detail": "; ".join(detail),
    }


def check_marketing(root: Path, code: str) -> dict:
    result = {"surface": "marketing", "where": str(root)}
    entry = language_config_entry(root / "config" / "languages.ts", code)
    if entry is None:
        return {**result, "state": "missing", "detail": "not in config/languages.ts"}

    common = root / "i18n" / "locales" / code / "common.json"
    english_count = json_leaf_count(root / "i18n" / "locales" / "en" / "common.json")
    count = json_leaf_count(common)

    terms_edition = (root / "app" / "utils" / "terms" / f"{code}.ts").exists()
    registered = False
    try:
        index = (root / "app" / "utils" / "terms" / "index.ts").read_text(encoding="utf-8")
        registered = re.search(r"\b" + re.escape(code) + r"\b", index) is not None
    except OSError:
        pass

    map_locales = (root / "embeddables" / "micro-frontends" / "1040-maps" / "src" / "i18n" / "locales" / code).is_dir()

    detail = ["enabled" if entry["enabled"] else "registered but switched off"]
    if count is None:
        detail.append("no common.json")
    elif english_count and count < english_count:
        detail.append(f"common.json {count}/{english_count} strings")
    else:
        detail.append("common.json complete")
    detail.append("terms edition " + ("registered" if terms_edition and registered
                                      else "present but not registered" if terms_edition
                                      else "missing"))
    detail.append("map locales " + ("present" if map_locales else "missing"))

    return {
        **result,
        "state": "present",
        "enabled": entry["enabled"],
        "common_strings": count,
        "english_strings": english_count,
        "terms_edition": terms_edition,
        "terms_registered": registered,
        "map_locales": map_locales,
        "detail": "; ".join(detail),
    }


def check_mobile(root: Path, code: str) -> dict:
    result = {"surface": "mobile", "where": str(root)}
    arb = root / "lib" / "l10n" / f"app_{code}.arb"
    count = arb_key_count(arb)
    english_count = arb_key_count(root / "lib" / "l10n" / "app_en.arb")

    listed = False
    try:
        controller = (root / "lib" / "services" / "locale_controller.dart").read_text(encoding="utf-8")
        listed = f"Locale('{code}')" in controller
    except OSError:
        pass

    if count is None and not listed:
        return {**result, "state": "missing", "detail": "no ARB file and not in the locale list"}

    detail = []
    if count is None:
        detail.append("no ARB file")
    elif english_count and count < english_count:
        detail.append(f"ARB {count}/{english_count} keys")
    else:
        detail.append("ARB complete")
    detail.append("offered in the app" if listed else "NOT in the app's locale list")

    return {
        **result,
        "state": "present",
        "arb_keys": count,
        "english_keys": english_count,
        "offered": listed,
        "detail": "; ".join(detail),
    }


def check_pipeline(root: Path, code: str) -> dict:
    result = {"surface": "pipeline", "where": str(root)}
    atlas = root / "data" / "language-atlas.yaml"
    try:
        source = atlas.read_text(encoding="utf-8")
    except OSError:
        return {**result, "state": "unknown", "detail": "no data/language-atlas.yaml"}

    # The atlas nests every language two spaces under `languages:`; matching the
    # indent avoids a stray `ro:` inside some other block.
    block = re.search(
        r"^  " + re.escape(code) + r":\s*$\n(?P<body>(?:^(?:    .*|\s*)$\n)*)",
        source,
        re.MULTILINE,
    )
    if not block:
        return {**result, "state": "missing", "detail": "no entry in data/language-atlas.yaml"}

    body = block.group("body")
    has_labels = "labels:" in body
    label_keys = {"area", "country", "population", "religion", "scan_here"}
    present_labels = {key for key in label_keys if re.search(r"^\s+" + key + r":", body, re.MULTILINE)}

    detail = ["atlas entry present"]
    if not has_labels:
        detail.append("no labels block — the prayer card cannot render")
    elif present_labels < label_keys:
        detail.append("labels missing: " + ", ".join(sorted(label_keys - present_labels)))
    else:
        detail.append("prayer-card labels complete")

    return {
        **result,
        "state": "present",
        "has_labels": has_labels,
        "missing_labels": sorted(label_keys - present_labels),
        "detail": "; ".join(detail),
    }


def check_people_groups(root: Path, code: str) -> dict:
    result = {"surface": "people-groups", "where": str(root)}
    tracker = root / "day-in-the-life" / "translation_progress.csv"
    try:
        with tracker.open(encoding="utf-8") as handle:
            reader = csv.reader(handle)
            header = next(reader)
            rows = list(reader)
    except (OSError, StopIteration):
        return {**result, "state": "unknown", "detail": "no day-in-the-life/translation_progress.csv"}

    if code not in header:
        return {**result, "state": "missing", "detail": "no column in translation_progress.csv"}

    index = header.index(code)
    done = sum(1 for row in rows if len(row) > index and row[index].strip() == "yes")
    return {
        **result,
        "state": "present",
        "groups_translated": done,
        "groups_tracked": len(rows),
        "detail": f"{done} of {len(rows)} people groups translated",
    }


# ----------------------------------------------------------------- report

SIBLINGS = {
    "marketing": check_marketing,
    "mobile": check_mobile,
    "pipeline": check_pipeline,
    "people-groups": check_people_groups,
}


def collect(code: str, base_url: str, root: Path) -> list[dict]:
    glossary = check_glossary(base_url, code)
    results = [glossary, check_campaigns_server(root, code, glossary)]

    registry = repos.load()
    for name, checker in SIBLINGS.items():
        recorded = registry.get(name)
        if not recorded:
            results.append({
                "surface": name,
                "state": "unregistered",
                "detail": f"no checkout registered — {repos.REPOS[name]['url']}",
            })
            continue
        ok, detail = repos.check(name, recorded)
        if not ok:
            results.append({"surface": name, "state": "unregistered", "detail": detail})
            continue
        results.append(checker(Path(detail), code))
    return results


MARKS = {
    "present": "ok",
    "missing": "MISSING",
    "unknown": "?",
    "unregistered": "-",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("code", help="language code, e.g. ro")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="campaigns server to read the glossary from")
    parser.add_argument("--root", default=".", help="campaigns server checkout (default: current directory)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    results = collect(args.code, args.base_url.rstrip("/"), Path(args.root).resolve())

    if args.json:
        print(json.dumps({"code": args.code, "surfaces": results}, indent=2))
        return 0

    print(f"Language: {args.code}")
    print()
    for row in results:
        print(f"{row['surface']:<18} {MARKS.get(row['state'], row['state']):<9} {row.get('detail', '')}")
    print()

    glossary = results[0]
    if glossary["state"] != "present":
        print("No glossary. Add the language at /admin/glossary before changing any repository:")
        print("terminology is decided there, and every other surface follows it.")
    elif not glossary.get("has_notes"):
        print("The glossary has no translation notes. Register, the prayer-prompt verbs,")
        print("acronym policy and number format are decided there; without them each")
        print("surface will make its own choices.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
