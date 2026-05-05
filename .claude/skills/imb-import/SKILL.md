# IMB People Groups Import

Add newly published unengaged IMB people groups into the Doxa database.

## When to use

When IMB publishes new unengaged groups on peoplegroups.org (typically annually, sometimes more frequent) and Doxa needs to start prayer campaigns for them.

This is the **creation** counterpart to the `imb-update` skill (which updates existing records). Use `imb-update` for syncing changed fields on already-imported groups.

## Process

### 1. Dry-run first

```bash
python3 .claude/skills/imb-import/imb-import.py \
  --api-key API_KEY \
  [--base-url URL] [--csv PATH] \
  --dry-run
```

- Without `--csv`, downloads the latest CSV from `https://peoplegroups.org/wp-content/uploads/people_groups.csv` and caches it in `data/tmp/`.
- Default `--base-url` is `http://localhost:3000`. For production use `https://pray.doxa.life`.
- API key must have `people_groups.edit` permission. Check `.env` for `ADMIN_API_KEY` or ask the user.

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
  --api-key API_KEY \
  [--base-url URL] [--csv PATH]
```

For each candidate:
- Sends `POST /api/admin/people-groups` with the IMB CSV mapped fields, `descriptions.en` from `PeopleDesc`, and the seed `needs:X` tags.
- Treats HTTP 409 (PEID collision) as a soft skip — re-running on the same CSV is safe.
- After successful creates, fires `POST /api/admin/people-groups/translate-field` with `{ fieldKey: 'descriptions', overwrite: false }` and streams progress to stdout. Pass `--skip-translate` to skip this step.

### 4. Verify

After completion:
- Open `/admin/onboarding` in the admin UI — newly imported groups should appear with `needs:*` tag badges and translation-pending badges (until the SSE stream completes).
- Spot-check a few records on `/admin/people-groups/[id]` — confirm description in English, six `needs:` tags present, IMB metadata populated.

### 5. Hand off to task-progresser

Once import succeeds, run the `task-progresser` skill to advance research + 365-prompt generation for the new groups. The colleague handles the `needs:X` adoption assets in parallel.

## Editing the seed tag list

The seed `NEEDS_TAGS` constant is at the top of `imb-import.py`. Edit that list to add or remove tags for future imports — no app code change required. Existing records are not retroactively updated.

## What this skill does NOT do

- It does not update existing records — use `imb-update` for that.
- It does not generate research or prayer prompts — that's the `task-progresser` skill.
- It does not produce adoption assets (cards, slides, certificates, QR codes) — those are produced by the colleague and tracked via the `needs:X` tags.
- It does not translate prayer prompts — those stay English-only for now.
