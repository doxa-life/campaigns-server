---
name: onboard-people-groups
description: Take people groups that already exist in the database and carry them to a live prayer campaign — completing the record, then research, 365 prompts, theological review, upload, adoption assets and optional translation. Use after new groups have been imported or approved. Invoke with /onboard-people-groups.
user-invocable: true
---

# Onboarding people groups

Takes groups that are **already in the database** and finishes them: a record
with everything filled in, a research dossier, 365 reviewed prayer prompts
uploaded as the group's Day in the Life library, and the six downloadable
adoption assets published.

Run about once a month, or after a batch of groups arrives. The same checklist
works whether one group is waiting or twenty.

**This skill does not create people groups.** They arrive two other ways, and
both happen before this runs:

- **`/imb-import`** creates records from IMB's published unengaged groups,
  usually once a year.
- **Field suggestions** at `/admin/people-groups/reports` — the public form at
  pray.doxa.life/updates, and admin field reports. An applied *add* creates the
  group. Two approvers, then Accept.

If nothing has been added, there is nothing here to do. Step 1 says so.

## Before starting

- An admin account on pray.doxa.life with `people_groups.edit` and
  `content.edit`. Its API key (`dxk_*`, issued at `/admin/profile`) is read from
  `.env`, so a normal run passes no key on the command line. Ask for one only
  when a script reports the variable is unset, and pass it as `--api-key`.
- The `people-groups` and `pipeline` repositories registered with
  `/doxa-repos`, since steps 3 and 4 run in them.
- For a local run, the dev server up with `bun run dev`.

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

The target also picks the key: `PRODUCTION_ADMIN_API_KEY` for prod,
`ADMIN_API_KEY` for local, staging and anything else. Scripts announce which
variable they used, never its value.

This runbook spans three repositories. Say the target out loud before step 1
and repeat it when handing off to `/task-progresser` or `/group-assets`, so each
of them is not deciding for itself.

The resource pipeline is a separate checkout with its own `.env`. If its admin
key is not set there, pass this one across for that command rather than asking
for a second key — the value never appears, only the command that reads it:

```bash
PRODUCTION_ADMIN_API_KEY=$(grep '^PRODUCTION_ADMIN_API_KEY=' "$PWD/.env" | cut -d= -f2-) \
  python3 .claude/skills/group-assets/needs_tags.py --target prod list
```

## Step 1 — See what is waiting, and complete each record

```bash
python3 .claude/skills/task-progresser/discover.py --target prod
```

One line per group with outstanding work, and the next step each needs:
`RESEARCH`, `PROMPTS`, `REVIEW`, `UPLOAD`, `TRANSLATE` or `NEEDS_TAG`. Nothing
listed means nothing to onboard. `/admin/onboarding` is the same picture in the
browser.

**Stop here and wait for the user to confirm.** Discovery only reads. Before
anything writes, report the outstanding work as a short list: a count of the
groups, then one line for each kind of work, giving how many groups need it and
their names. End by asking whether to proceed:

```text
2 new people groups.
- 1 (Bashi) needs the Day in the Life prompts
- 2 (Bashi, Fumbira) need the people group resources

Proceed? (or tell me which ones to do)
```

Use plain names for the work: record details, Day in the Life prompts,
description translations, people group resources. Do only what the user
approves.

**A group created from a field suggestion is missing what an import would have
set.** Open it at `/admin/people-groups/[id]` and supply:

1. The English description. The other locales are step 4's job, not the
   detail page's translate button.
2. Region, if blank.

A group with no PEID is expected here: it is not on IMB's list, and the
quarterly sync ignores records without one.

**Then add a row to `todo.csv`** in the people-groups checkout for each group —
name, slug, the group's Doxa id as `campaign_id`, country, religion. The stage
skills in that repository work from that file, so a group missing from it is a
group they cannot see.

**Check that repository's IMB export is current** before research runs. If
groups were just imported, the CSV the import downloaded into `data/tmp/` should
be copied over `research/data/imb_people_groups.csv` there. Without it the
demographic block is built from the Doxa record instead, which works but carries
less detail.

## Step 2 — Research, prompts, review, upload

Each group needs a research dossier, 365 English prompts, a theological review,
and an upload into its `day_in_life` library.

**For a handful of groups**, one at a time:

```text
/task-progresser
```

One group and one step per invocation. It picks the group with the most
outstanding work, advances it by one stage, and stops. Re-invoke until discovery
reports nothing left. That pace is deliberate: each stage is a long background
agent, and a dossier is worth a glance before 365 prompts are written from it.

**For many groups**, invoke the people-groups repository's stage skills
directly. Each holds several agents open at once:

```text
/research-groups
/generate-prompts
/review-prompts
```

**Never re-upload English into a library that already has translations.** The
plain import replaces all content. Use that repository's
`upload-translations.ts --include-english true`, which merges.

## Step 3 — Adoption assets

The resource pipeline renders all six downloadable assets and clears the tags
that requested them. From the `pipeline` checkout:

```text
/group-assets
```

It lists what is outstanding, renders every resource in every language,
verifies, deploys on your confirmation, then clears the `needs:` tags. Portraits
need no work: a group with no photograph of its own is created with a regional
default.

A language whose atlas entry is incomplete is skipped and reported. That is an
`/add-language` job in the pipeline, not something to work around.

This step and step 2 are independent. Either order, or both at once.

## Step 4 — Translation

**Who translates.** In a skill run you write the translations yourself. The
in-app buttons — the description translate button, **Translate All Content**,
`POST /api/admin/people-groups/translate-field` — call OpenRouter, and those are
for an admin clicking in the browser, not for this runbook. Read the language's
published terminology first, `GET /api/glossary/{lang}` (public, no auth; 404
means no glossary exists yet for it), and save through
`PUT /api/admin/people-groups/[id]` with the full `descriptions` object.

A description is not free prose: it fills the `{peopleDesc}` slot of the
`peopleDesc` template in `i18n/locales/{lang}/people-groups.json` — "They are
{peopleDesc}." — so each translation has to read as a predicate complement in
its own language. Render it inside that carrier sentence and check it before
saving; a phrase carrying a finite verb breaks the languages whose template puts
the verb last.

**Descriptions** are cheap and always done.

**Day in the Life prompts** are optional and translated only for groups with
committed prayer partners. From the `people-groups` checkout,
`/translate-prompts <slug>`.

## Step 5 — Spot checks

- `/admin/people-groups/[id]` — description in English plus translations, IMB
  fields populated, `needs:` tags gone.
- `/admin/people-groups/[id]/content` — the Day in the Life library holds 365
  days of English.
- `/admin/onboarding` — the group has dropped off prompts-pending and
  translation-pending.
- The public page `/{slug}` renders with its description and photo.
- One downloadable asset opens and names the right group.

## Not this skill's job

- **Creating people groups** — `/imb-import`, or approving a suggestion at
  `/admin/people-groups/reports`.
- **Syncing changed IMB fields** into existing records, flipping engagement
  status, archiving groups IMB dropped — `/imb-update`, quarterly, on its own
  schedule.

## Reference

- `GET /api/admin/people-groups/onboarding-status` — what step 1 reads
- `PUT /api/admin/people-groups/[id]` with `{ tags: [...] }` — tags
- `GET /api/glossary/{lang}` — reviewed terminology, public; `?format=markdown`
- `PUT /api/admin/people-groups/[id]` with `{ descriptions: {...} }` — descriptions
- `POST /api/admin/libraries/import` with `library_key: 'day_in_life'`
