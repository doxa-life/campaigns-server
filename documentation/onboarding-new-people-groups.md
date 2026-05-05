# Onboarding New People Groups — Runbook

When IMB publishes new unengaged people groups on peoplegroups.org, follow this runbook to add them to Doxa and start a prayer campaign for each.

## Prerequisites

- A campaigns-sever admin account with `people_groups.edit` and `content.edit` permissions
- An admin API key (`dxk_*`) for that account — generate via `/admin/profile`
- The sibling `people-groups/` repo cloned at `../people-groups/` relative to this project
- The dev server running locally (`bun run dev`) or a production base URL

## Step 1 — Run `imb-import`

When the IMB email arrives (or whenever you want to check for new groups):

```bash
# Dry run first to see what would be created
python3 .claude/skills/imb-import/imb-import.py \
  --api-key dxk_... \
  --dry-run

# Looks good? Apply
python3 .claude/skills/imb-import/imb-import.py \
  --api-key dxk_...
```

The skill:
- Downloads the latest IMB CSV (cached in `data/tmp/`)
- Filters for groups that should be added (filter rules in the [skill SKILL.md](../.claude/skills/imb-import/SKILL.md))
- Creates each new people group via `POST /api/admin/people-groups` with description, IMB metadata, and seed `needs:X` tags
- Fires batch DeepL translation on descriptions and streams progress to stdout

For production runs, add `--base-url https://pray.doxa.life`.

## Step 2 — Hand off the asset queue to the colleague

Send the colleague the link: **https://pray.doxa.life/admin/onboarding** (or the local equivalent).

The dashboard lists every people group with outstanding setup work, including:
- `prompts pending` — research + 365 prayer prompts not yet uploaded
- `translation: <locale>` — description not yet translated to that locale
- `needs:adoption-certificate`, `needs:people-group-picture`, `needs:qr-code`, `needs:printable-prayer-card`, `needs:promo-slide`, `needs:social-share-image` — adoption assets the colleague produces

The colleague produces the six adoption assets and uploads each to S3 / Cloudflare. After confirming an asset is uploaded, **manually clear the corresponding `needs:X` tag** on the people-group detail page (`/admin/people-groups/[id]`) — clicking the X on the tag chip removes it via PUT.

Either the colleague (if they have admin access) or another admin can clear tags.

## Step 3 — Run `task-progresser` to advance research + prompts

For each newly imported group, invoke the `task-progresser` skill **one PG at a time** (via Claude Code):

```text
/task-progresser
```

The skill:
1. Calls `/api/admin/people-groups/onboarding-status` and reconciles against local files in `../people-groups/dinl/`
2. Picks one group with outstanding work
3. Runs the appropriate next step:
   - **Research** — follows `../people-groups/dinl/Research Prompt.md`, dispatches Sonnet subagents, writes findings to `dinl/people-group-findings/{slug}.md`
   - **Prompts** — follows `../people-groups/dinl/Prayer Fuel AI Prompt v5.md`, generates 365 prayer prompts to `dinl/prompts/{slug}.csv`
   - **Upload** — runs `bun run scripts/import-dinl.ts` to push the prompts CSV via `POST /api/admin/libraries/import`
4. Reports what advanced and exits — re-invoke for the next group

Research takes ~2-8 minutes per group; prompt generation ~5-10 minutes; upload ~seconds.

## Step 4 — Verification spot-checks

After import + task-progresser have run for a group:

- `/admin/people-groups/[id]` — confirm the description shows in English plus translations, all six `needs:` tags are present, IMB metadata fields are populated.
- `/admin/people-groups/[id]/content` — confirm the `Day in the Life` library exists with 365 days of content.
- `/admin/onboarding` — refresh; the group should drop off the prompts-pending list. It will remain on the dashboard until all six `needs:X` tags are cleared.
- Public page: `/{slug}` — sign-up page renders correctly with the description.

## Special case — non-IMB people group

For the rare case of adding an unengaged group that is not on peoplegroups.org:

1. Create the record manually via the admin UI on `/admin/people-groups` (use the existing "create" flow).
2. Add the six `needs:X` tags manually via the tag widget on the detail page.
3. Set the English description in the description field.
4. Run `task-progresser` to advance research + prompts the same as IMB-imported groups.

## What's out of scope (for now)

- Prayer prompts are English-only; the multi-language prompt pipeline is not part of this workflow.
- QR codes are produced as part of designed assets by the colleague (not auto-generated).
- The printable prayer-card deck is regenerated manually by the colleague when they print a fresh batch.
- When a group later becomes engaged (per `imb-update`'s SPI logic), the engagement_status flips automatically; no de-onboarding is performed.

## Related skills

- [`imb-update`](../.claude/skills/imb-update/SKILL.md) — quarterly sync of changed fields on existing records
- [`imb-import`](../.claude/skills/imb-import/SKILL.md) — this runbook's primary tool, creates new records
- [`task-progresser`](../.claude/skills/task-progresser/SKILL.md) — advances research + prompts, one PG at a time

## Architecture quick reference

- Tags column: `people_groups.tags JSONB DEFAULT '[]'::jsonb` (migration 062)
- Creation endpoint: `POST /api/admin/people-groups` (gated on `people_groups.edit`)
- Tag mutations: existing `PUT /api/admin/people-groups/[id]` accepts `{ tags: string[] }`
- Onboarding dashboard: `GET /api/admin/people-groups/onboarding-status`
- Tag autocomplete: `GET /api/admin/people-groups/tags-distinct`
- Batch translation: `POST /api/admin/people-groups/translate-field` (existing, SSE response)
- Prompts upload: `POST /api/admin/libraries/import` (existing, called via `scripts/import-dinl.ts`)
