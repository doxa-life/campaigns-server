#!/usr/bin/env python3
"""
IMB People Groups Data Update

Downloads the latest IMB people groups CSV, compares it against the Doxa
database via the admin API, and generates/applies bulk updates.

Usage:
  python3 scripts/imb-update.py --api-key KEY [--base-url URL] [--apply] [--csv PATH]

Options:
  --api-key KEY      Admin API key (required)
  --base-url URL     API base URL (default: http://localhost:3000)
  --csv PATH         Use a local CSV instead of downloading
  --apply            Actually send updates (default: dry run)
  --skip-archive     Skip archiving people groups not in IMB
"""

import argparse
import csv
import hashlib
import io
import json
import os
import sys
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
IMB_CSV_URL = 'https://peoplegroups.org/wp-content/uploads/people_groups.csv'
CACHE_DIR = Path(__file__).parent.parent / 'data' / 'tmp'
BATCH_SIZE = 500

# ---------------------------------------------------------------------------
# Field mappings
# ---------------------------------------------------------------------------
# Table column fields: (csv_col, doxa_key, transform)
TABLE_FIELDS = [
    ('Pop', 'population', lambda v: int(v.replace(',', '')) if v else None),
    ('EngStat', 'engagement_status', lambda v: {'Engaged': 'engaged', 'Unengaged': 'unengaged'}.get(v, v)),
    ('ROR', 'primary_religion', None),
    ('ROL', 'primary_language', None),
    ('Latitude', 'latitude', lambda v: float(v) if v else None),
    ('Longitude', 'longitude', lambda v: float(v) if v else None),
]

# Metadata fields: (csv_col, doxa_key, transform)
META_FIELDS = [
    ('GSEC', 'imb_gsec', None),
    ('CongExst', 'imb_congregation_existing', lambda v: '1' if v == 'Yes' else '0'),
    ('Plnting', 'imb_church_planting', lambda v: {
        'No Churches Planted': '0',
        'Churches Planted Among Reached Only': '1',
        'Concentrated Church Planting': '2',
        'Churches Planted Among Unreached': '2',
    }.get(v, v)),
    ('AffCd', 'imb_affinity_code', None),
    ('ROP1', 'imb_reg_of_people_1', None),
    ('ROP2', 'imb_reg_of_people_2', None),
    ('ROP25', 'imb_reg_of_people_25', None),
    ('ROP3', 'imb_reg_of_people_3', None),
    ('Indigenous', 'imb_is_indigenous', lambda v: '1' if v == 'Indigenous' else '0'),
    ('Bible', 'imb_bible_available', lambda v: v == 'Available'),
    ('Jesus', 'imb_jesus_film_available', lambda v: v == 'Available'),
    ('Radio', 'imb_radio_broadcast_available', lambda v: v == 'Available'),
    ('Gospel', 'imb_gospel_recordings_available', lambda v: v == 'Available'),
    ('Audio', 'imb_audio_scripture_available', lambda v: v == 'Available'),
    ('Stories', 'imb_bible_stories_available', lambda v: v == 'Available'),
    ('ROR4', 'imb_reg_of_religion_4', None),
    ('NmAlt', 'imb_alternate_name', lambda v: None if v == 'None' else v),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

UA = 'imb-update/1.0'

def api_get(base_url: str, path: str, api_key: str):
    req = urllib.request.Request(
        f'{base_url}{path}',
        headers={'X-Api-Key': api_key, 'User-Agent': UA}
    )
    return json.load(urllib.request.urlopen(req))


def api_post(base_url: str, path: str, api_key: str, body: dict):
    payload = json.dumps(body, default=str).encode()
    req = urllib.request.Request(
        f'{base_url}{path}',
        data=payload,
        method='POST',
        headers={'X-Api-Key': api_key, 'Content-Type': 'application/json', 'User-Agent': UA}
    )
    return json.load(urllib.request.urlopen(req))


def values_differ(doxa_val, imb_val, key: str) -> bool:
    """Compare a Doxa value with an IMB value, handling type/format differences."""
    d_empty = doxa_val is None or doxa_val == '' or doxa_val == 'None'
    i_empty = imb_val is None or imb_val == '' or imb_val == 'None'

    if d_empty and i_empty:
        return False
    # IMB has a real value, Doxa doesn't — update
    if not i_empty and d_empty:
        return True
    # IMB has no value, Doxa has one — keep Doxa's (never erase)
    if i_empty and not d_empty:
        return False

    if key in ('latitude', 'longitude'):
        try:
            d = float(doxa_val) if doxa_val is not None else 0
            i = float(imb_val) if imb_val is not None else 0
            return abs(d - i) > 0.001
        except (ValueError, TypeError):
            pass
    if key == 'population':
        try:
            return int(doxa_val or 0) != int(imb_val or 0)
        except (ValueError, TypeError):
            pass
    if key.endswith('_available'):
        return bool(doxa_val) != bool(imb_val)

    return str(doxa_val or '') != str(imb_val or '')


def download_csv(csv_path: str | None) -> str:
    """Download IMB CSV (with caching) or use a provided local path."""
    if csv_path:
        print(f"Using local CSV: {csv_path}")
        return csv_path

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Download to temp, hash to check if changed
    print(f"Downloading {IMB_CSV_URL} ...")
    response = urllib.request.urlopen(IMB_CSV_URL)
    data = response.read()
    content_hash = hashlib.md5(data).hexdigest()[:8]

    # Check if we already have this exact file
    cached_files = sorted(CACHE_DIR.glob('IMB *.csv'), reverse=True)
    for cached in cached_files:
        existing_data = cached.read_bytes()
        if hashlib.md5(existing_data).hexdigest()[:8] == content_hash:
            print(f"CSV unchanged, using cached: {cached.name}")
            return str(cached)

    # Save with date-like name
    from datetime import datetime
    filename = f"IMB {datetime.now().strftime('%Y-%m')}.csv"
    filepath = CACHE_DIR / filename
    filepath.write_bytes(data)
    print(f"Saved new CSV: {filepath.name} ({len(data):,} bytes)")
    return str(filepath)


def load_imb_csv(path: str) -> dict[str, dict]:
    """Load IMB CSV indexed by PEID."""
    imb_by_peid = {}
    with open(path, 'r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            peid = row.get('PEID', '').strip()
            if peid:
                imb_by_peid[peid] = row
    return imb_by_peid


def fetch_doxa_data(base_url: str, api_key: str):
    """Fetch all Doxa people groups with activity logs."""
    print("Fetching Doxa data with activity logs...")
    data = api_get(base_url, '/api/admin/people-groups?include=activity', api_key)
    people_groups = data['peopleGroups']
    print(f"  {len(people_groups)} people groups loaded")

    doxa_by_peid = {}
    manual_fields_by_peid = {}

    for pg in people_groups:
        meta = pg.get('metadata', {})
        peid = str(meta.get('imb_peid', ''))
        if not peid:
            continue
        doxa_by_peid[peid] = pg

        # Collect manually edited fields (excluding previous IMB Report Updates)
        changed = set()
        for a in pg.get('activity', []):
            if a.get('metadata', {}).get('source') == 'IMB Report Update':
                continue
            changes = a.get('metadata', {}).get('changes', {})
            changed.update(changes.keys())
        if changed:
            manual_fields_by_peid[peid] = changed

    return doxa_by_peid, manual_fields_by_peid


def build_updates(doxa_by_peid, manual_fields_by_peid, imb_by_peid):
    """Compare all fields and build update payloads."""
    matched = set(doxa_by_peid.keys()) & set(imb_by_peid.keys())
    only_doxa = set(doxa_by_peid.keys()) - set(imb_by_peid.keys())

    updates = []
    field_change_counts = {}
    skipped_manual = {}
    engagement_changes = []

    for peid in sorted(matched):
        imb = imb_by_peid[peid]
        doxa = doxa_by_peid[peid]
        manual = manual_fields_by_peid.get(peid, set())

        table_changes = {}
        meta_changes = {}

        for csv_col, doxa_key, transform in TABLE_FIELDS:
            if doxa_key in manual:
                skipped_manual[doxa_key] = skipped_manual.get(doxa_key, 0) + 1
                continue
            imb_raw = imb.get(csv_col, '').strip()
            imb_val = transform(imb_raw) if transform else imb_raw
            doxa_val = doxa.get(doxa_key)
            if values_differ(doxa_val, imb_val, doxa_key):
                table_changes[doxa_key] = imb_val
                field_change_counts[doxa_key] = field_change_counts.get(doxa_key, 0) + 1
                if doxa_key == 'engagement_status' and imb_val == 'engaged':
                    engagement_changes.append((peid, doxa.get('name', ''), imb.get('Ctry', '')))

        for csv_col, doxa_key, transform in META_FIELDS:
            if doxa_key in manual:
                skipped_manual[doxa_key] = skipped_manual.get(doxa_key, 0) + 1
                continue
            imb_raw = imb.get(csv_col, '').strip()
            imb_val = transform(imb_raw) if transform else imb_raw
            doxa_val = doxa.get('metadata', {}).get(doxa_key)
            if values_differ(doxa_val, imb_val, doxa_key):
                meta_changes[doxa_key] = imb_val
                field_change_counts[doxa_key] = field_change_counts.get(doxa_key, 0) + 1

        if table_changes or meta_changes:
            update = {'slug': doxa.get('slug'), **table_changes}
            if meta_changes:
                update['metadata'] = meta_changes
            updates.append(update)

    # Build archive list for PEIDs no longer in IMB
    archive_updates = []
    for peid in sorted(only_doxa):
        doxa = doxa_by_peid[peid]
        if doxa.get('status') != 'archived':
            archive_updates.append({
                'slug': doxa.get('slug'),
                'status': 'archived',
                'metadata': {'reason_unlisted': 'merged_or_deleted'}
            })

    # Archive diaspora groups (imb_is_indigenous = '0')
    diaspora_updates = []
    for peid in sorted(matched):
        doxa = doxa_by_peid[peid]
        if doxa.get('status') == 'archived':
            continue
        meta = doxa.get('metadata', {})
        imb = imb_by_peid[peid]
        is_indigenous = imb.get('Indigenous', '').strip()
        if is_indigenous == 'Diaspora':
            diaspora_updates.append({
                'slug': doxa.get('slug'),
                'status': 'archived',
                'metadata': {'reason_unlisted': 'is_diaspora'}
            })

    # Archive Christian groups (religion basis = Christianity)
    # Exclude engaged groups — they're actively being worked with
    christian_codes = ('C', 'CPR', 'CPC', 'CRO', 'CEV', 'CAO', 'CAN', 'CCM', 'CFC', 'CRC', 'COR', 'CNP')
    christian_updates = []
    for peid in sorted(matched):
        doxa = doxa_by_peid[peid]
        if doxa.get('status') == 'archived':
            continue
        if doxa.get('engagement_status') == 'engaged':
            continue
        imb = imb_by_peid[peid]
        religion = imb.get('ROR', '').strip()
        if religion in christian_codes:
            christian_updates.append({
                'slug': doxa.get('slug'),
                'status': 'archived',
                'metadata': {'reason_unlisted': 'historically_christian'}
            })

    # Upgrade to engaged based on SPI >= 1
    # Even if IMB EngStat says "Unengaged", SPI >= 1 means strategic progress
    spi_engagement_updates = []
    for peid in sorted(matched):
        doxa = doxa_by_peid[peid]
        if doxa.get('status') == 'archived':
            continue
        if doxa.get('engagement_status') == 'engaged':
            continue
        manual = manual_fields_by_peid.get(peid, set())
        if 'engagement_status' in manual:
            continue
        imb = imb_by_peid[peid]
        try:
            spi = int(imb.get('SPI', '0').strip() or '0')
        except ValueError:
            continue
        if spi >= 1:
            spi_engagement_updates.append({
                'slug': doxa.get('slug'),
                'engagement_status': 'engaged',
                'metadata': {'reason_engaged': 'imb_report'}
            })

    return (updates, archive_updates, diaspora_updates, christian_updates,
            spi_engagement_updates,
            field_change_counts, skipped_manual, engagement_changes, only_doxa)


def print_report(updates, archive_updates, diaspora_updates, christian_updates,
                 spi_engagement_updates,
                 field_change_counts, skipped_manual,
                 engagement_changes, only_doxa, doxa_by_peid):
    """Print a summary of what would change."""
    print(f"\n{'=' * 60}")
    print(f"  IMB UPDATE REPORT")
    print(f"{'=' * 60}")

    print(f"\nPeople groups to update: {len(updates)}")
    if field_change_counts:
        print(f"\nField changes:")
        for field, count in sorted(field_change_counts.items(), key=lambda x: -x[1]):
            print(f"  {field}: {count}")

    if skipped_manual:
        print(f"\nSkipped (manual edits preserved):")
        for field, count in sorted(skipped_manual.items(), key=lambda x: -x[1]):
            print(f"  {field}: {count}")

    if engagement_changes:
        print(f"\nNewly engaged ({len(engagement_changes)}):")
        for peid, name, country in engagement_changes:
            print(f"  {name} ({country})")

    if only_doxa:
        print(f"\nPEIDs in Doxa but not in IMB ({len(only_doxa)}):")
        for peid in sorted(only_doxa):
            pg = doxa_by_peid[peid]
            status = pg.get('status', '')
            marker = ' (already archived)' if status == 'archived' else ''
            print(f"  PEID {peid}: {pg.get('name', '')} ({pg.get('country_code', '')}){marker}")
        if archive_updates:
            print(f"  → {len(archive_updates)} will be archived")

    if diaspora_updates:
        print(f"\nDiaspora groups to archive ({len(diaspora_updates)}):")
        for u in diaspora_updates:
            print(f"  {u['slug']}")

    if christian_updates:
        print(f"\nChristian groups to archive ({len(christian_updates)}):")
        for u in christian_updates:
            print(f"  {u['slug']}")

    if spi_engagement_updates:
        print(f"\nSPI-based engagement upgrades ({len(spi_engagement_updates)}):")
        for u in spi_engagement_updates:
            print(f"  {u['slug']}")

    total_actions = len(updates) + len(archive_updates) + len(diaspora_updates) + len(christian_updates) + len(spi_engagement_updates)
    print(f"\nTotal actions: {total_actions}")
    print()


def apply_updates(base_url, api_key, updates, archive_updates, diaspora_updates, christian_updates, spi_engagement_updates):
    """Send updates via bulk-update API."""
    all_updates = updates + archive_updates + diaspora_updates + christian_updates + spi_engagement_updates
    if not all_updates:
        print("Nothing to update.")
        return

    total_updated = 0
    total_errors = 0

    print(f"Sending {len(all_updates)} updates in batches of {BATCH_SIZE}...")
    for i in range(0, len(all_updates), BATCH_SIZE):
        batch = all_updates[i:i + BATCH_SIZE]
        resp = api_post(base_url, '/api/admin/people-groups/bulk-update', api_key,
                        {'updates': batch})
        stats = resp.get('stats', {})
        total_updated += stats.get('updated', 0)
        total_errors += stats.get('errors', 0)
        print(f"  Batch {i // BATCH_SIZE + 1} ({len(batch)} items): {resp.get('message', '')}")

        if resp.get('errors'):
            for err in resp['errors'][:10]:
                print(f"    ERROR: {err}")

    print(f"\nTotal: {total_updated} updated, {total_errors} errors")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='IMB People Groups Data Update')
    parser.add_argument('--api-key', required=True, help='Admin API key')
    parser.add_argument('--base-url', default='http://localhost:3000', help='API base URL')
    parser.add_argument('--csv', default=None, help='Local CSV path (skip download)')
    parser.add_argument('--apply', action='store_true', help='Apply updates (default: dry run)')
    parser.add_argument('--skip-archive', action='store_true', help='Skip archiving removed PEIDs')
    args = parser.parse_args()

    # 1. Get CSV
    csv_path = download_csv(args.csv)

    # 2. Load data
    imb_by_peid = load_imb_csv(csv_path)
    print(f"IMB CSV: {len(imb_by_peid)} people groups")

    doxa_by_peid, manual_fields_by_peid = fetch_doxa_data(args.base_url, args.api_key)
    print(f"Doxa: {len(doxa_by_peid)} people groups with PEIDs")

    # 3. Compare
    updates, archive_updates, diaspora_updates, christian_updates, \
        spi_engagement_updates, field_change_counts, skipped_manual, \
        engagement_changes, only_doxa = build_updates(
            doxa_by_peid, manual_fields_by_peid, imb_by_peid)

    if args.skip_archive:
        archive_updates = []
        diaspora_updates = []
        christian_updates = []

    # 4. Report
    print_report(updates, archive_updates, diaspora_updates, christian_updates,
                 spi_engagement_updates, field_change_counts, skipped_manual,
                 engagement_changes, only_doxa, doxa_by_peid)

    # 5. Apply or dry-run
    if args.apply:
        total_actions = len(updates) + len(archive_updates) + len(diaspora_updates) + len(christian_updates) + len(spi_engagement_updates)
        if total_actions == 0:
            print("Nothing to update.")
            return
        confirm = input(f"Apply {total_actions} updates? [y/N] ").strip().lower()
        if confirm != 'y':
            print("Aborted.")
            return
        apply_updates(args.base_url, args.api_key, updates, archive_updates,
                      diaspora_updates, christian_updates, spi_engagement_updates)
    else:
        print("DRY RUN — pass --apply to execute updates")


if __name__ == '__main__':
    main()
