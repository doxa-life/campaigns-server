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
their names. Then ask the run's questions, all in this one message, in plain
text:

```text
2 new people groups on production.
- 1 (Bashi) needs the Day in the Life prompts
- 2 (Bashi, Fumbira) need the people group resources

1. Build the Day in the Life prompts? Research, 365 prompts, theological
   review, then upload, for Bashi.
2. Build the people group resources? Prayer card, promo slide, QR code and
   social share in every language, for Bashi and Fumbira.
3. Rebuild the prayer-card bundles? Needed because groups are new. Every card
   in every language is re-rendered, about twelve minutes, then bundled into one
   PDF per language. Needs about 27 GB free; the pipeline disk has 51 GB.
```

Ask question 3 whenever a group is new or one is tagged `needs:bundle-removal`,
and fill it in from step 3's bundle section: the work, the time and the space
for this machine, with free space read from `df -h` on the pipeline checkout.

These are the only questions until the run ends. Use plain names for the work:
record details, Day in the Life prompts, description translations, people group
resources, prayer-card bundles. Do only what the user approves.

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

Carry every approved group through all four stages and upload it, without
pausing between stages or asking before the upload. Nobody reads the dossiers,
prompts or review reports during the run: a stage that passes its skill's
validation goes straight on to the next, and the upload follows the review.

Use the people-groups repository's stage skills, which hold several agents open
at once, then upload each reviewed group from this project:

```text
/research-groups
/generate-prompts
/review-prompts
```

```bash
bun run scripts/import-dinl.ts --url BASE_URL --key API_KEY --slug {slug}
```

**Once the prompts are uploaded, commit them in the people-groups checkout.**
Stage the run's own files by path, not with `git add -A`: each group's dossier,
prompts and review, the `research/cache/` and `research/inconsistencies/` files
the agents wrote, and `todo.csv`. The message names the groups, e.g.
`Amazigh, Tataouine and Bushi`. Commit only; do not push.

`/task-progresser` advances one group by one stage and stops. It is for nudging
a single group by hand, not for this run.

**Never re-upload English into a library that already has translations.** The
plain import replaces all content. Use that repository's
`upload-translations.ts --include-english true`, which merges.

## Step 3 — Adoption assets

The resource pipeline renders all six downloadable assets and clears the tags
that requested them. From the `pipeline` checkout:

```text
/group-assets
```

It lists what is outstanding, renders every resource in every language and
verifies. Stop there: the upload to the bucket, and the tag clearing that
follows it, are offered at the end of the run (see **Finishing**), on every
target, local included. Portraits need no work: a group with no photograph of
its own is created with a regional default.

A language whose atlas entry is incomplete is skipped and reported. That is an
`/add-language` job in the pipeline, not something to work around.

This step and step 2 are independent. Either order, or both at once.

### Prayer-card bundles

A bundle is every prayer card in one language in a single print PDF, and it
holds only the groups the last full fetch listed. So a new group is missing
from every bundle, and an archived one (`needs:bundle-removal`) is still in
them, until the bundles are rebuilt. They go to Google Drive by hand, not to
the bucket; `deploy` skips them.

Rebuilt after the resources render, from the `pipeline` checkout, with the
run's server (`DOXA_SITE_URL=http://localhost:3000` in front of each command for
a local run):

```bash
./pipeline.py fetch --refresh
./pipeline.py render --resource prayer-card-bundle --jobs 12
./pipeline.py verify --resource prayer-card-bundle
```

What to tell the user when asking, for about 2,100 groups and eleven languages:

| | cards not on disk | every card already in `build/intermediate/prayer-card-jpg/{lang}/` |
|---|---|---|
| work | re-render every card, then bundle: about a minute a language, twelve minutes in all | bundle only, with `--reuse-cards` on the render, about 35 seconds a language |
| disk | ~14 GB of card images plus ~13 GB of bundles | ~13 GB of bundles |

Count the card images per language before asking, and take the right column.
Then clear `needs:bundle-removal` on archived groups as `/group-assets`
describes.

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

## Finishing

The closing report says what finished per group and **only what is blocked**:
a stage that failed its validation after the fix its skill allows, a failed
upload or render, a missing key, a skipped language. Review grades, rewritten
lines and logged data inconsistencies are not blockers. They are in the
people-groups files, and the report does not list them.

Then close with the two uploads.

**The resources, to the bucket.** Give the command and ask whether to run it:

```bash
./pipeline.py deploy --groups build/queue.txt
```

from the `pipeline` checkout. On a yes, run it, then clear the tags as
`/group-assets` step 4 describes. On a no, leave the tags; they are how the
next run knows the upload is still owed.

**The bundles, to Google Drive.** If they were rebuilt, tell the user to upload
`build/output/bundles/prayer-card-bundle-{lang}.pdf` from the `pipeline`
checkout to Google Drive by hand, giving the full path and the list of files.

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
