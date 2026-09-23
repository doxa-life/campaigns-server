# IMB People Groups Import

Add newly published unengaged IMB people groups into the Doxa database.

## When to use

When IMB publishes new unengaged groups on peoplegroups.org (typically annually, sometimes more frequent) and Doxa needs to start prayer campaigns for them.

This is the **creation** counterpart to the `imb-update` skill (which updates existing records). Use `imb-update` for syncing changed fields on already-imported groups.

## Which server

Say which server this run is for, and say it once:

| | |
|---|---|
| `--target local` | `http://localhost:3000` |
| `--target prod` | `https://pray.doxa.life` |
| `--base-url URL` | staging, or anywhere else |

**There is no default.** A script that guesses eventually writes production
records to a development database or the reverse, and every script here prints
the target it resolved before its first request, so the choice is visible in the
transcript.

Use the same target for every command in the run. A run that is half local and
half production leaves records pointing at things that do not exist.

## Process

### 1. Dry-run first

```bash
python3 .claude/skills/imb-import/imb-import.py \
  --target prod \
  [--csv PATH] \
  --dry-run
```

- Without `--csv`, downloads the latest CSV from `https://peoplegroups.org/wp-content/uploads/people_groups.csv` and caches it in `data/tmp/`.
- The admin API key is read from `.env` per target: `PRODUCTION_ADMIN_API_KEY` for prod, `ADMIN_API_KEY` otherwise, so a normal run passes no key. The script names the variable it used, never the value. Ask for a key only when it reports the variable is unset, then pass `--api-key`.
- The key needs `people_groups.edit`.
- Confirm the target with the person before the apply run. This creates records.

### 2. Review the candidate list

The dry-run prints a filter summary and the first 20 candidates. The filter rules are:

- PEID is not already in Doxa
- `Indigenous != 'Diaspora'`
- `ROR` (religion) is not a Christian-religion code (`C`, `CPR`, `CPC`, `CRO`, `CEV`, `CAO`, `CAN`, `CCM`, `CFC`, `CRC`, `COR`, `CNP`)
- `EngStat == 'Unengaged'`
- `GSEC ∈ {0, 1, 2}`

If the count looks reasonable (typically a handful per import event), continue. If unexpectedly large, investigate.

### 3. Apply

```bash
python3 .claude/skills/imb-import/imb-import.py \
  --target prod \
  [--csv PATH]
```

For each candidate:
- Looks up the Joshua Project ID by scraping the "View on Joshua Project" link from `https://peoplegroups.org/people_groups/<PGID>/` (e.g. `PG023974` → JP id `11835`). Sets `joshua_project_id` on the payload when found; logs a warning and proceeds without it on failure. See `fetch_joshua_project_id()` in `imb-import.py`.
- Sends `POST /api/admin/people-groups` with the IMB CSV mapped fields, `descriptions.en` from `PeopleDesc`, and the seed `needs:X` tags.
- If the IMB photo URL is the "no image available" placeholder (matched by `IMB_NO_PHOTO_MARKERS` substrings), substitutes a regional placeholder from `https://s3.doxa.life/no-photo-images/<slug>.jpg` based on `Regn`/`RegnSub` (and a `deaf-` prefix for groups whose name starts with "Deaf "). See `regional_placeholder_url()` in `imb-import.py`.
- Treats HTTP 409 (PEID collision) as a soft skip — re-running on the same CSV is safe.
- Writes `descriptions.en` and nothing else. The import does not translate: `/onboard-people-groups` step 4 writes the other locales against the published glossary, and the in-app translate buttons are the admin UI's own path.

### 4. Verify

After completion:
- Open `/admin/onboarding` in the admin UI — newly imported groups should appear with `needs:*` tag badges and translation-pending badges, which stay until step 4 of `/onboard-people-groups` runs.
- Spot-check a few records on `/admin/people-groups/[id]` — confirm description in English, four `needs:` tags present, IMB metadata populated.

### 5. Hand off

Once import succeeds:

- Run the `task-progresser` skill to advance research and 365-prompt generation for the new groups.
- Run `/group-assets` in the resource pipeline repository to render and publish the six downloadable adoption assets and clear the `needs:` tags. `/doxa-repos` holds the path to that checkout.

Both can run in parallel; neither depends on the other.

`/onboard-people-groups` is the checklist that carries the imported groups the rest of the way, and it covers both of the above plus translation and the final checks.

## Editing the seed tag list

The seed `NEEDS_TAGS` constant is at the top of `imb-import.py`. Edit that list to add or remove tags for future imports — no app code change required. Existing records are not retroactively updated.

## What this skill does NOT do

- It does not update existing records — use `imb-update` for that.
- It does not generate research or prayer prompts — that's the `task-progresser` skill.
- It does not produce adoption assets (cards, slides, certificates, QR codes) — the resource pipeline's `/group-assets` skill renders them and clears the `needs:X` tags.
- It does not translate prayer prompts — that is per group, on demand, and paid for per group. See `/translate-prompts` in the people-groups repository.
