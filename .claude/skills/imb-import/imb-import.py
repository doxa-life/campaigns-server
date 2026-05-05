#!/usr/bin/env python3
"""
IMB People Groups Import — create new Doxa records for newly published unengaged groups.

Pulls the latest peoplegroups.org CSV, filters for groups that should be added
to Doxa, and creates them via the admin POST /api/admin/people-groups endpoint.
After creation, triggers batch translation of descriptions across enabled locales.

Usage:
  python3 .claude/skills/imb-import/imb-import.py --api-key KEY [--base-url URL] [--csv PATH] [--dry-run] [--limit N]

Filter rules for adding a new people group:
  - PEID is not already in Doxa
  - Indigenous != 'Diaspora'
  - ROR (religion) is not a Christian-religion code
  - EngStat == 'Unengaged'
  - GSEC ∈ {0, 1, 2}
"""

import argparse
import csv
import hashlib
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
IMB_CSV_URL = 'https://peoplegroups.org/wp-content/uploads/people_groups.csv'
CACHE_DIR = Path(__file__).parent.parent.parent.parent / 'data' / 'tmp'
UA = 'imb-import/1.0'

CHRISTIAN_CODES = ('C', 'CPR', 'CPC', 'CRO', 'CEV', 'CAO', 'CAN', 'CCM', 'CFC', 'CRC', 'COR', 'CNP')

# Seed the asset-needs tags on every newly imported group. Edit this list to
# add or remove default tags — no app code change needed.
NEEDS_TAGS = [
    'needs:adoption-certificate',
    'needs:people-group-picture',
    'needs:qr-code',
    'needs:printable-prayer-card',
    'needs:promo-slide',
    'needs:social-share-image',
]

REQUIRED_COLUMNS = ('PEID', 'Name', 'PeopleDesc', 'EngStat', 'GSEC', 'Indigenous', 'ROR', 'Ctry', 'ISOalpha3')

# Label → code maps for IMB CSV columns that send English labels but are
# stored as codes in the DB (kept in sync with i18n/locales/en/people-groups.json).
POP_CLASS_MAP = {
    'Less than 10,000': '0',
    '100,000 - 249,999': '1',
    '25,000 - 49,999': '2',
    '250,000 - 499,999': '3',
    '10,000 - 24,999': '4',
    '500,000 - 999,999': '5',
    '50,000 - 99,999': '6',
    '1,000,000 - 2,499,999': '7',
    '5,000,000 - 9,999,999': '8',
    '2,500,000 - 4,999,999': '9',
    '10,000,000+': '10',
}

EVNG_LEVEL_MAP = {
    'No Known Evangelicals': '0',
    'Less than 2%': '1',
    '2% or Greater but Less than 5%': '2',
    '5% or Greater but Less than 10%': '3',
    '10% or Greater but Less than 15%': '4',
    '15% or Greater but Less than 20%': '5',
    '20% or Greater but Less than 30%': '6',
    '30% or Greater but Less than 40%': '7',
    '40% or Greater but Less than 50%': '8',
    '50% or Greater but Less than 75%': '9',
    '75% or Greater': '10',
}

BIBLE_TRANS_LEVEL_MAP = {
    'None': '0',
    'Stories': '1',
    'Selections': '2',
    'New Testament': '3',
    'Bible': '4',
}

# ISO3 country code → (doxa_wagf_region, doxa_wagf_block, doxa_wagf_member)
# Derived from existing Doxa records (consistent across all 2,085 PGs).
# Codes match the field-def options in app/utils/people-group-fields/fields/doxa-wagf-*.ts.
# Countries not in this map default to ('na', 'na', 'na').
WAGF_BY_ISO3 = {
    'ABW': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'AFG': ('asia', 'south_asia', 'no'),
    'AGO': ('africa', 'southern_africa', 'yes'),
    'ALB': ('europe', 'south_europe', 'yes'),
    'AND': ('na', 'na', 'na'),
    'ARE': ('middle_east', 'middle_east', 'no'),
    'ARM': ('europe', 'east_europe', 'yes'),
    'ASM': ('oceania', 'oceania', 'yes'),
    'ATG': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'no'),
    'AZE': ('asia', 'central_asia', 'no'),
    'BEN': ('africa', 'west_africa', 'yes'),
    'BFA': ('africa', 'west_africa', 'yes'),
    'BGD': ('asia', 'south_asia', 'yes'),
    'BGR': ('europe', 'the_balkans', 'yes'),
    'BHR': ('middle_east', 'middle_east', 'no'),
    'BHS': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'BIH': ('europe', 'the_balkans', 'no'),
    'BLM': ('na', 'na', 'na'),
    'BLR': ('europe', 'east_europe', 'yes'),
    'BMU': ('na', 'na', 'na'),
    'BOL': ('latin_america_&_caribbean', 'south_cone', 'yes'),
    'BRA': ('latin_america_&_caribbean', 'brazil', 'no'),
    'BRB': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'no'),
    'BRN': ('asia', 'south_east_asia', 'yes'),
    'BTN': ('asia', 'south_asia', 'no'),
    'CAF': ('africa', 'central_africa', 'no'),
    'CCK': ('na', 'na', 'na'),
    'CHN': ('asia', 'north_asia', 'no'),
    'CIV': ('africa', 'west_africa', 'yes'),
    'CMR': ('africa', 'central_africa', 'yes'),
    'COD': ('africa', 'central_africa', 'yes'),
    'COG': ('africa', 'central_africa', 'no'),
    'COK': ('oceania', 'oceania', 'no'),
    'COL': ('latin_america_&_caribbean', 'andean', 'yes'),
    'COM': ('africa', 'islands_of_east_africa', 'no'),
    'CUB': ('latin_america_&_caribbean', 'mexico_&_latin_america', 'yes'),
    'CUW': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'CXR': ('na', 'na', 'na'),
    'CYM': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'no'),
    'CYP': ('europe', 'south_europe', 'no'),
    'CZE': ('europe', 'central_europe', 'yes'),
    'DJI': ('africa', 'east_africa', 'no'),
    'DMA': ('na', 'na', 'na'),
    'DZA': ('middle_east', 'middle_east', 'no'),
    'ECU': ('latin_america_&_caribbean', 'andean', 'yes'),
    'EGY': ('middle_east', 'middle_east', 'yes'),
    'ERI': ('africa', 'east_africa', 'no'),
    'ESH': ('middle_east', 'middle_east', 'yes'),
    'ESP': ('europe', 'south_europe', 'yes'),
    'ETH': ('africa', 'east_africa', 'yes'),
    'FIN': ('europe', 'north_europe', 'yes'),
    'FJI': ('oceania', 'oceania', 'yes'),
    'FRO': ('europe', 'north_europe', 'yes'),
    'FSM': ('oceania', 'oceania', 'yes'),
    'GAB': ('africa', 'central_africa', 'yes'),
    'GEO': ('europe', 'east_europe', 'yes'),
    'GGY': ('europe', 'west_europe', 'yes'),
    'GHA': ('africa', 'west_africa', 'yes'),
    'GIB': ('europe', 'west_europe', 'yes'),
    'GIN': ('africa', 'west_africa', 'yes'),
    'GLP': ('na', 'na', 'na'),
    'GMB': ('africa', 'west_africa', 'no'),
    'GNB': ('africa', 'west_africa', 'no'),
    'GNQ': ('africa', 'central_africa', 'yes'),
    'GRC': ('europe', 'south_europe', 'yes'),
    'GRD': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'GUF': ('na', 'na', 'na'),
    'GUM': ('oceania', 'oceania', 'yes'),
    'GUY': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'HKG': ('asia', 'north_asia', 'yes'),
    'IDN': ('asia', 'south_east_asia', 'yes'),
    'IND': ('asia', 'south_asia', 'yes'),
    'IRN': ('middle_east', 'middle_east', 'yes'),
    'IRQ': ('middle_east', 'middle_east', 'yes'),
    'ISL': ('europe', 'north_europe', 'no'),
    'ISR': ('europe', 'south_europe', 'yes'),
    'JAM': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'JEY': ('europe', 'west_europe', 'yes'),
    'JOR': ('middle_east', 'middle_east', 'yes'),
    'JPN': ('asia', 'north_east_asia', 'yes'),
    'KAZ': ('asia', 'central_asia', 'yes'),
    'KEN': ('africa', 'east_africa', 'yes'),
    'KGZ': ('asia', 'central_asia', 'yes'),
    'KHM': ('asia', 'south_east_asia', 'yes'),
    'KIR': ('oceania', 'oceania', 'yes'),
    'KOS': ('europe', 'the_balkans', 'yes'),
    'KWT': ('middle_east', 'middle_east', 'no'),
    'LAO': ('asia', 'south_east_asia', 'no'),
    'LBN': ('middle_east', 'middle_east', 'no'),
    'LBR': ('africa', 'west_africa', 'yes'),
    'LBY': ('middle_east', 'middle_east', 'no'),
    'LCA': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'no'),
    'LIE': ('europe', 'west_europe', 'no'),
    'LKA': ('asia', 'south_asia', 'yes'),
    'LUX': ('europe', 'west_europe', 'no'),
    'MAC': ('asia', 'north_asia', 'no'),
    'MAR': ('middle_east', 'middle_east', 'yes'),
    'MCO': ('na', 'na', 'na'),
    'MDV': ('asia', 'south_asia', 'no'),
    'MHL': ('oceania', 'oceania', 'no'),
    'MLI': ('africa', 'west_africa', 'no'),
    'MLT': ('europe', 'south_europe', 'yes'),
    'MMR': ('asia', 'south_east_asia', 'yes'),
    'MNE': ('europe', 'the_balkans', 'yes'),
    'MNG': ('asia', 'north_asia', 'yes'),
    'MNP': ('oceania', 'oceania', 'yes'),
    'MOZ': ('africa', 'southern_africa', 'yes'),
    'MRT': ('middle_east', 'middle_east', 'no'),
    'MSR': ('na', 'na', 'na'),
    'MUS': ('africa', 'islands_of_east_africa', 'yes'),
    'MWI': ('africa', 'southern_africa', 'yes'),
    'MYS': ('asia', 'south_east_asia', 'yes'),
    'MYT': ('africa', 'islands_of_east_africa', 'no'),
    'NAM': ('africa', 'southern_africa', 'yes'),
    'NCL': ('oceania', 'oceania', 'yes'),
    'NER': ('africa', 'west_africa', 'yes'),
    'NFK': ('na', 'na', 'na'),
    'NGA': ('africa', 'central_africa', 'yes'),
    'NIU': ('na', 'na', 'na'),
    'NPL': ('asia', 'south_asia', 'yes'),
    'NZL': ('oceania', 'oceania', 'yes'),
    'OMN': ('middle_east', 'middle_east', 'no'),
    'PAK': ('asia', 'south_asia', 'yes'),
    'PAN': ('latin_america_&_caribbean', 'central_america', 'yes'),
    'PER': ('latin_america_&_caribbean', 'andean', 'yes'),
    'PHL': ('asia', 'south_east_asia', 'yes'),
    'PLW': ('oceania', 'oceania', 'yes'),
    'PNG': ('oceania', 'oceania', 'yes'),
    'PRK': ('asia', 'north_east_asia', 'no'),
    'PRY': ('latin_america_&_caribbean', 'south_cone', 'yes'),
    'PSE': ('middle_east', 'middle_east', 'no'),
    'PYF': ('oceania', 'oceania', 'yes'),
    'QAT': ('middle_east', 'middle_east', 'no'),
    'RUS': ('europe', 'east_europe', 'yes'),
    'SAU': ('middle_east', 'middle_east', 'no'),
    'SDN': ('middle_east', 'middle_east', 'no'),
    'SEN': ('africa', 'west_africa', 'yes'),
    'SHN': ('europe', 'west_europe', 'yes'),
    'SJM': ('europe', 'north_europe', 'yes'),
    'SLB': ('oceania', 'oceania', 'yes'),
    'SLE': ('africa', 'west_africa', 'yes'),
    'SMR': ('na', 'na', 'na'),
    'SOM': ('africa', 'east_africa', 'no'),
    'SSD': ('africa', 'east_africa', 'no'),
    'STP': ('africa', 'southern_africa', 'no'),
    'SUR': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'SWE': ('europe', 'north_europe', 'no'),
    'SWZ': ('africa', 'southern_africa', 'yes'),
    'SXM': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'no'),
    'SYR': ('middle_east', 'middle_east', 'no'),
    'TCA': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'yes'),
    'TCD': ('africa', 'west_africa', 'no'),
    'TGO': ('africa', 'west_africa', 'yes'),
    'THA': ('asia', 'south_east_asia', 'yes'),
    'TJK': ('asia', 'central_asia', 'no'),
    'TKL': ('na', 'na', 'na'),
    'TON': ('oceania', 'oceania', 'yes'),
    'TUN': ('middle_east', 'middle_east', 'no'),
    'TUR': ('europe', 'south_europe', 'no'),
    'TZA': ('africa', 'east_africa', 'yes'),
    'UGA': ('africa', 'east_africa', 'yes'),
    'UZB': ('asia', 'central_asia', 'yes'),
    'VCT': ('north_america_&_non-spanish_caribbean', 'non-spanish_caribbean', 'no'),
    'VEN': ('latin_america_&_caribbean', 'andean', 'yes'),
    'VGB': ('na', 'na', 'na'),
    'VIR': ('na', 'na', 'na'),
    'VNM': ('asia', 'south_east_asia', 'yes'),
    'VUT': ('oceania', 'oceania', 'yes'),
    'WLF': ('na', 'na', 'na'),
    'WSM': ('oceania', 'oceania', 'yes'),
    'YEM': ('middle_east', 'middle_east', 'no'),
    'ZAF': ('africa', 'southern_africa', 'yes'),
    'ZMB': ('africa', 'southern_africa', 'yes'),
    'ZWE': ('africa', 'southern_africa', 'yes'),
}


# Parse IMB PicCrdt HTML into the structured segments array used by
# the picture-credit field. Mirrors migrations/040_parse_picture_credit.js.
def parse_credit_html(html):
    if not html or 'No photo available' in html:
        return None

    import re
    text = re.sub(r'</?div[^>]*>', '', html)
    text = re.sub(r'href="+', 'href="', text)
    text = re.sub(r'""+', '"', text)

    segments = []
    remaining = text
    while remaining:
        link_start = remaining.find('<a ')
        if link_start == -1:
            plain = remaining.strip()
            if plain:
                segments.append({'text': plain, 'link': None})
            break

        if link_start > 0:
            before = remaining[:link_start]
            if before.strip():
                segments.append({'text': before, 'link': None})

        href_match = re.search(r'href="([^"]*)"', remaining[link_start:])
        href = href_match.group(1) if href_match else None

        gt_pos = remaining.find('>', link_start)
        close_pos = remaining.find('</a>', link_start)
        if gt_pos == -1 or close_pos == -1:
            rest = re.sub(r'<[^>]*>', '', remaining[link_start:]).strip()
            if rest:
                segments.append({'text': rest, 'link': None})
            break

        link_text = remaining[gt_pos + 1:close_pos].strip()
        if link_text:
            segments.append({'text': link_text, 'link': href})

        remaining = remaining[close_pos + 4:]

    return segments or None

# ---------------------------------------------------------------------------
# Field mappings (mirror imb-update.py — keep in sync if mappings drift)
# ---------------------------------------------------------------------------
def parse_int(v):
    if not v:
        return None
    try:
        return int(v.replace(',', ''))
    except ValueError:
        return None


def parse_float(v):
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


# Top-level columns: (csv_col, doxa_key, transform)
TABLE_FIELDS = [
    ('Pop', 'population', parse_int),
    ('EngStat', 'engagement_status', lambda v: {'Engaged': 'engaged', 'Unengaged': 'unengaged'}.get(v, v)),
    ('ROR', 'primary_religion', None),
    ('ROL', 'primary_language', None),
    ('Latitude', 'latitude', parse_float),
    ('Longitude', 'longitude', parse_float),
]

# Metadata fields: (csv_col, doxa_key, transform)
META_FIELDS = [
    ('PGID', 'imb_pgid', None),
    ('NmDisp', 'imb_display_name', None),
    ('NmAlt', 'imb_alternate_name', lambda v: None if v == 'None' else v),
    ('RegnSub', 'imb_subregion', None),
    ('LocationDesc', 'imb_location_description', None),
    ('PopCls', 'imb_population_class', lambda v: POP_CLASS_MAP.get(v)),
    ('EvngLvl', 'imb_evangelical_level', lambda v: EVNG_LEVEL_MAP.get(v)),
    ('GSEC', 'imb_gsec', None),
    ('SPI', 'imb_strategic_priority_index', None),
    ('LPI', 'imb_lostness_priority_index', None),
    ('CongExst', 'imb_congregation_existing', lambda v: '1' if v == 'Yes' else '0'),
    ('Plnting', 'imb_church_planting', lambda v: {
        'No Churches Planted': '0',
        'Churches Planted Among Reached Only': '1',
        'Concentrated Church Planting': '2',
        'Churches Planted Among Unreached': '2',
    }.get(v, v)),
    ('AffCd', 'imb_affinity_code', None),
    ('LangFamily', 'imb_language_family', None),
    ('LangClass', 'imb_language_class', None),
    ('LangSpkrs', 'imb_language_speakers', None),
    ('ROR3', 'imb_reg_of_religion_3', None),
    ('ROR4', 'imb_reg_of_religion_4', None),
    ('PplNm', 'imb_people_name', None),
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
    ('ResTot', 'imb_total_resources_available', None),
    ('LvlBible', 'imb_bible_translation_level', lambda v: BIBLE_TRANS_LEVEL_MAP.get(v)),
    ('YrPub', 'imb_bible_year_published', lambda v: None if v == 'None' else v),
    ('Photo', 'imb_has_photo', lambda v: v == 'Y'),
    ('PicCrdt', 'imb_picture_credit_html', None),
    ('PicCrdt', 'picture_credit', parse_credit_html),
    ('PeopleSearch', 'imb_people_search_text', None),
]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def auth_headers(api_key, content_type=None):
    headers = {'Authorization': f'Bearer {api_key}', 'User-Agent': UA}
    if content_type:
        headers['Content-Type'] = content_type
    return headers


def api_get(base_url, path, api_key):
    req = urllib.request.Request(f'{base_url}{path}', headers=auth_headers(api_key))
    return json.load(urllib.request.urlopen(req))


def api_post(base_url, path, api_key, body):
    payload = json.dumps(body, default=str).encode()
    req = urllib.request.Request(
        f'{base_url}{path}',
        data=payload,
        method='POST',
        headers=auth_headers(api_key, 'application/json'),
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        try:
            parsed = json.loads(body)
        except ValueError:
            parsed = {'message': body}
        return e.code, parsed


# ---------------------------------------------------------------------------
# CSV loading
# ---------------------------------------------------------------------------
def download_csv(csv_path):
    if csv_path:
        print(f"Using local CSV: {csv_path}")
        return csv_path

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {IMB_CSV_URL} ...")
    response = urllib.request.urlopen(IMB_CSV_URL)
    data = response.read()
    content_hash = hashlib.md5(data).hexdigest()[:8]

    for cached in sorted(CACHE_DIR.glob('IMB *.csv'), reverse=True):
        if hashlib.md5(cached.read_bytes()).hexdigest()[:8] == content_hash:
            print(f"CSV unchanged, using cached: {cached.name}")
            return str(cached)

    filename = f"IMB {datetime.now().strftime('%Y-%m')}.csv"
    filepath = CACHE_DIR / filename
    filepath.write_bytes(data)
    print(f"Saved new CSV: {filepath.name} ({len(data):,} bytes)")
    return str(filepath)


def load_csv(path):
    rows = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            print(f"ERROR: IMB CSV missing required columns: {missing}", file=sys.stderr)
            sys.exit(1)
        for row in reader:
            rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Doxa state
# ---------------------------------------------------------------------------
def fetch_existing_peids(base_url, api_key):
    print("Fetching existing Doxa people groups ...")
    existing = set()
    page_size = 500
    offset = 0
    total = None
    while total is None or offset < total:
        data = api_get(base_url, f'/api/admin/people-groups?limit={page_size}&offset={offset}', api_key)
        total = data.get('total', 0)
        for pg in data.get('peopleGroups', []):
            peid = (pg.get('metadata') or {}).get('imb_peid')
            if peid:
                existing.add(str(peid).strip())
        offset += page_size
    print(f"  {len(existing)} existing PEIDs loaded")
    return existing


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------
def filter_new_groups(rows, existing_peids):
    """Apply Doxa's onboarding filter and return rows that should be created."""
    keep = []
    skip_counts = {
        'no_peid': 0,
        'already_in_doxa': 0,
        'diaspora': 0,
        'christian': 0,
        'engaged': 0,
        'gsec_too_high': 0,
    }

    for row in rows:
        peid = row.get('PEID', '').strip()
        if not peid:
            skip_counts['no_peid'] += 1
            continue
        if peid in existing_peids:
            skip_counts['already_in_doxa'] += 1
            continue
        if row.get('Indigenous', '').strip() == 'Diaspora':
            skip_counts['diaspora'] += 1
            continue
        ror = row.get('ROR', '').strip()
        if ror in CHRISTIAN_CODES:
            skip_counts['christian'] += 1
            continue
        engstat = row.get('EngStat', '').strip()
        if engstat != 'Unengaged':
            skip_counts['engaged'] += 1
            continue
        try:
            gsec = int(row.get('GSEC', '').strip() or '99')
        except ValueError:
            gsec = 99
        if gsec > 2:
            skip_counts['gsec_too_high'] += 1
            continue
        keep.append(row)

    return keep, skip_counts


# ---------------------------------------------------------------------------
# Build POST payload
# ---------------------------------------------------------------------------
def build_payload(row):
    name = (row.get('NmDisp') or row.get('Name') or '').strip()
    peid = row.get('PEID', '').strip()
    description = (row.get('PeopleDesc') or '').strip() or None
    country_code = (row.get('ISOalpha3') or '').strip() or None
    region = (row.get('Regn') or '').strip() or None
    image_url = (row.get('PicURL') or '').strip() or None

    payload = {
        'name': name,
        'peid': peid,
        'tags': NEEDS_TAGS,
        'country_code': country_code,
        'region': region,
        'engagement_status': 'unengaged',
        'status': 'active',
    }
    if description:
        payload['description'] = description
    if image_url:
        payload['image_url'] = image_url

    metadata = {}
    for csv_col, key, transform in TABLE_FIELDS:
        raw = (row.get(csv_col) or '').strip()
        val = transform(raw) if transform else (raw or None)
        if key in ('engagement_status',):
            # already on payload
            continue
        payload[key] = val

    for csv_col, key, transform in META_FIELDS:
        raw = (row.get(csv_col) or '').strip()
        val = transform(raw) if transform else (raw or None)
        if val is None or val == '':
            continue
        metadata[key] = val

    # WAGF region/block/member derived from country (no equivalent IMB CSV column).
    # If the country has precedent in Doxa's existing data, copy the assignment;
    # otherwise leave WAGF fields unset for an admin to fill in manually.
    iso = country_code or ''
    wagf = WAGF_BY_ISO3.get(iso)
    if wagf:
        metadata['doxa_wagf_region'] = wagf[0]
        metadata['doxa_wagf_block'] = wagf[1]
        metadata['doxa_wagf_member'] = wagf[2]

    if metadata:
        payload['metadata'] = metadata

    return payload


# ---------------------------------------------------------------------------
# Translate-field SSE consumption
# ---------------------------------------------------------------------------
def trigger_batch_translation(base_url, api_key):
    print("\nTriggering batch translation of descriptions ...")
    payload = json.dumps({'fieldKey': 'descriptions', 'overwrite': False}).encode()
    req = urllib.request.Request(
        f'{base_url}/api/admin/people-groups/translate-field',
        data=payload,
        method='POST',
        headers=auth_headers(api_key, 'application/json'),
    )
    try:
        with urllib.request.urlopen(req) as resp:
            for raw in resp:
                line = raw.decode('utf-8', errors='replace').rstrip()
                if not line or not line.startswith('data:'):
                    continue
                body = line[5:].strip()
                try:
                    event = json.loads(body)
                except ValueError:
                    continue
                etype = event.get('type') or event.get('event')
                msg = event.get('message') or ''
                if etype == 'progress':
                    pct = event.get('percent')
                    pct_str = f" ({pct}%)" if pct is not None else ''
                    print(f"  progress: {msg}{pct_str}")
                elif etype == 'complete':
                    print(f"  complete: {msg or 'translation finished'}")
                elif etype == 'error':
                    print(f"  ERROR: {msg or event}")
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f"  ERROR: HTTP {e.code}: {body[:300]}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='Import new IMB people groups into Doxa')
    parser.add_argument('--api-key', required=True, help='Admin API key (dxk_*)')
    parser.add_argument('--base-url', default='http://localhost:3000', help='API base URL')
    parser.add_argument('--csv', default=None, help='Local CSV path (skip download)')
    parser.add_argument('--dry-run', action='store_true', help='Print planned creations without POSTing')
    parser.add_argument('--limit', type=int, default=0, help='Stop after N successful creates (0 = no limit)')
    parser.add_argument('--skip-translate', action='store_true', help='Do not trigger batch translation after creates')
    args = parser.parse_args()

    csv_path = download_csv(args.csv)
    rows = load_csv(csv_path)
    print(f"IMB CSV: {len(rows)} rows")

    existing_peids = fetch_existing_peids(args.base_url, args.api_key)

    candidates, skip_counts = filter_new_groups(rows, existing_peids)
    print(f"\nFilter summary:")
    for k, v in skip_counts.items():
        print(f"  skipped — {k}: {v}")
    print(f"  candidates to create: {len(candidates)}")

    if not candidates:
        print("Nothing new to import.")
        return

    print("\nCandidates:")
    for r in candidates[:20]:
        name = (r.get('NmDisp') or r.get('Name') or '').strip()
        print(f"  PEID {r.get('PEID', ''):>6}  GSEC={r.get('GSEC', ''):<2}  {name} ({r.get('Ctry', '')})")
    if len(candidates) > 20:
        print(f"  ... and {len(candidates) - 20} more")

    if args.dry_run:
        print("\nDRY RUN — pass without --dry-run to create records")
        return

    print(f"\nCreating {len(candidates)} people groups via POST /api/admin/people-groups ...")
    created = 0
    skipped_409 = 0
    failed = 0

    for i, row in enumerate(candidates, 1):
        if args.limit and created >= args.limit:
            print(f"Reached --limit {args.limit}, stopping")
            break

        payload = build_payload(row)
        name = payload['name']
        peid = payload['peid']

        status, body = api_post(args.base_url, '/api/admin/people-groups', args.api_key, payload)
        if status in (200, 201):
            print(f"  [{i}/{len(candidates)}] CREATED  PEID {peid}  {name}")
            created += 1
        elif status == 409:
            print(f"  [{i}/{len(candidates)}] SKIP 409 PEID {peid}  {name} (already exists)")
            skipped_409 += 1
        else:
            msg = (body or {}).get('statusMessage') or (body or {}).get('message') or str(body)[:200]
            print(f"  [{i}/{len(candidates)}] FAILED   PEID {peid}  {name}  → {status}: {msg}")
            failed += 1

    print(f"\nCreated: {created}")
    print(f"Skipped (409): {skipped_409}")
    print(f"Failed: {failed}")

    if created > 0 and not args.skip_translate:
        trigger_batch_translation(args.base_url, args.api_key)


if __name__ == '__main__':
    main()
