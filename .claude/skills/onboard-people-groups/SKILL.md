---
name: onboard-people-groups
description: The monthly checklist that takes new people groups from "IMB published it" or "someone told us about it" to a live prayer campaign — field suggestions, IMB import, research and 365 prompts, adoption assets, and optional translation. Invoke with /onboard-people-groups.
user-invocable: true
---

# Onboarding new people groups

Run about once a month. It takes a new people group from arrival to a live
prayer campaign with a description in every language, a 365-day Day in the Life
library, and its adoption assets published.

New groups arrive two ways. **IMB** publishes new unengaged groups on
peoplegroups.org, usually once a year. **Field suggestions** come through the
public form at pray.doxa.life/updates and through field reports admins enter by
hand. The same checklist works whether one group arrived or twenty.

## Before starting

- An admin account on pray.doxa.life with `people_groups.edit` and
  `content.edit`, and an API key (`dxk_*`) generated on `/admin/profile`. Ask
  for the key rather than looking for one.
- The `people-groups` and `pipeline` repositories registered with
  `/doxa-repos`, since steps 3 and 4 run in them.
- For local runs, `bun run dev`. For production, pass
  `--base-url https://pray.doxa.life` to every script.

## Step 1 — Field suggestions

Open `/admin/people-groups/reports` and work through anything not yet accepted
or denied.

**Public suggestions** sit in *awaiting verification* until the reporter clicks
the link in their email, then move to *pending*. Both designated approvers click
**Approve**, then either clicks **Accept** to apply. Applying an *add* creates
the people group; an *update* changes fields; a *remove* archives the group with
the reason given. **Deny** at any stage emails the reporter that it was not
applied. Approvers are set with the **Approvers** button in the page header.

**Admin field reports** apply on a single **Accept**. A report marked *not in our
system yet* cannot create a group — it can only be linked to an existing one. If
the group is genuinely new, submit it through /updates so it goes through the
add flow, or wait for the IMB import.

**After an add suggestion is applied**, open the group and supply what an IMB
import would have:

1. The six tags: `needs:adoption-certificate`, `needs:people-group-picture`,
   `needs:qr-code`, `needs:printable-prayer-card`, `needs:promo-slide`,
   `needs:social-share-image`.
2. The English description, then the description field's translate button for
   the other languages.
3. Region, if blank.

A group that is not on IMB's list has no PEID. That is expected: the quarterly
sync ignores records without one.

## Step 2 — IMB import

```bash
python3 .claude/skills/imb-import/imb-import.py --api-key dxk_... --dry-run
python3 .claude/skills/imb-import/imb-import.py --api-key dxk_...
```

See `/imb-import` for what it filters and what it sets. A handful of candidates
is normal; investigate a large count before applying.

Then give the research step the same data: copy the CSV the import downloaded
into `data/tmp/` over `research/data/imb_people_groups.csv` in the
`people-groups` checkout. Without it the research prompt is built from the Doxa
record instead, which works but carries less detail.

## Step 3 — Research, prompts, review, upload

Each new group needs a research dossier, 365 English prompts, a theological
review, and an upload into its `day_in_life` library.

```text
/task-progresser
```

One group per invocation. It picks the next group with work outstanding and runs
one step. Re-invoke until discovery reports nothing left. To see the queue
without advancing it:

```bash
python3 .claude/skills/task-progresser/discover.py --api-key dxk_... --base-url https://pray.doxa.life
```

For many groups at once, invoke that repository's stage skills directly —
`/research-groups`, `/generate-prompts`, `/review-prompts` — each of which
runs a batch; its README is the manual. Either way, add a row to that repository's
`todo.csv` for each new group so the trackers stay complete.

**Never re-upload English into a library that already has translations.** The
plain import replaces all content. Use that repository's
`upload-translations.ts --include-english true`, which merges.

## Step 4 — Adoption assets

The resource pipeline renders all six downloadable assets and clears the tags
that requested them. From the `pipeline` checkout:

```text
/group-assets
```

It lists what is outstanding, renders every resource in every language, verifies,
deploys on your confirmation, and then clears the `needs:` tags. Portraits need
no work: a group with no photograph of its own is created with a regional
default.

A language whose atlas entry is incomplete is skipped and reported. That is a
`/add-language` job in the pipeline, not something to work around.

## Step 5 — Translation

**Descriptions** are cheap and always done: the import does it automatically, and
a manual group gets it from the translate button in step 1.

**Day in the Life prompts** are optional and cost real money per group, so only
groups with committed prayer partners are translated. From the `people-groups`
checkout, `/translate-prompts <slug>`. The in-app alternative is
`/admin/people-groups/[id]/content` → **Translate All Content**, which is
convenient for one group and bills per token.

## Step 6 — Spot checks

- `/admin/people-groups/[id]` — description in English plus translations, IMB
  fields populated, `needs:` tags gone.
- `/admin/people-groups/[id]/content` — the Day in the Life library holds 365
  days of English.
- `/admin/onboarding` — the group has dropped off prompts-pending and
  translation-pending.
- The public page `/{slug}` renders with its description and photo.
- One downloadable asset opens and names the right group.

## Quarterly, not monthly

`/imb-update` syncs changed IMB fields into existing records, flips engagement
status, and archives groups IMB dropped. It runs on its own schedule and is not
part of this checklist.

## Reference

- `POST /api/admin/people-groups` — create; requires a PEID. The reports flow is
  the only PEID-less path
- `PUT /api/admin/people-groups/[id]` with `{ tags: [...] }` — tags
- `GET /api/admin/people-groups/onboarding-status` — the dashboard's data
- `POST /api/admin/people-groups/translate-field` — description translation (SSE)
- `POST /api/updates` — public suggestions;
  `/api/admin/people-group-reports/[id]/approve|accept|deny|link`
- `POST /api/admin/libraries/import` with `library_key: 'day_in_life'`
