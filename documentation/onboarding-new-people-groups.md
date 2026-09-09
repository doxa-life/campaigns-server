# Onboarding New People Groups

*This file is the source of truth. It is mirrored as the "Onboarding New People Groups" page of the DOXA TECH portfolio at https://apps.gospelambition.org/@doxa/context/. After editing here, update that page with the same text.*

A developer runs this about once a month. It takes a new people group from "someone told us about it" or "IMB published it" to a live prayer campaign with a description in every language, a 365-day Day in the Life library, and the adoption assets queued for the designer.

New groups arrive two ways:

- **IMB** publishes new unengaged groups on peoplegroups.org, usually once a year, sometimes more often. Step 2 imports them.
- **Field suggestions** come in through the public form at pray.doxa.life/updates and through field reports admins enter by hand. Step 1 reviews them. An approved "add" suggestion creates the group.

The same checklist works whether one group arrived or twenty.

## Prerequisites

- An admin account on pray.doxa.life with `people_groups.edit` and `content.edit` permissions
- An admin API key (`dxk_*`) for that account, generated on `/admin/profile`
- The `campaigns-sever` repo, with Claude Code for the research and prompt steps
- The `people-groups` repo cloned beside it at `../people-groups/` (github.com/doxa-life/people-groups). Its scripts run from its root.
- For local runs, the dev server (`bun run dev`). For production, pass `--base-url https://pray.doxa.life` to every script below.

## Step 1 - Field suggestions

Open `/admin/people-groups/reports` and work through anything not yet accepted or denied.

**Public suggestions** (source "public", submitted on /updates):
- They sit in *awaiting verification* until the reporter clicks the link in their email, then move to *pending*.
- Both designated approvers must click **Approve**. Then either approver clicks **Accept** to apply. Applying an **add** suggestion creates the people group; an **update** changes fields; a **remove** archives the group with the reason given.
- **Deny** at any stage emails the reporter that it was not applied.
- The approvers are set with the **Approvers** button in the page header. The page warns when fewer than two are configured.

**Admin field reports** (source "admin", entered with **New Report**, optionally parsed from pasted text with **Parse with AI**) apply on a single **Accept**. A report marked *Not in our system yet* cannot create a group. It can only be linked to an existing one with **Link to People Group**. If the group is genuinely new, submit it through /updates so it goes through the add flow, or wait for the IMB import if IMB lists it.

**After an add suggestion is applied**, open the new group on `/admin/people-groups/[id]` and fill in what an IMB import would have supplied:
1. Add the six tags in the tag widget: `needs:adoption-certificate`, `needs:people-group-picture`, `needs:qr-code`, `needs:printable-prayer-card`, `needs:promo-slide`, `needs:social-share-image`.
2. Write the English description, then click the description field's translate button to fill the other languages.
3. Set Region if it is blank. The WAGF region, block, and member fields can be set from the country when known.

A group that is not on IMB's list has no PEID. That is expected. The quarterly IMB sync ignores records without one, and a PEID is only assigned if IMB later adds the group.

## Step 2 - IMB import

```bash
# See what would be created
python3 .claude/skills/imb-import/imb-import.py --api-key dxk_... --dry-run

# Create them
python3 .claude/skills/imb-import/imb-import.py --api-key dxk_...
```

The script downloads the latest IMB CSV into `data/tmp/`, keeps groups that are unengaged, indigenous, not historically Christian, and GSEC 0 to 2, skips PEIDs already in Doxa, and creates the rest with the IMB fields, the English description, a regional placeholder photo when IMB has none, the Joshua Project id, and the six `needs:` tags. It then translates the new descriptions and streams progress. A handful of candidates is normal; investigate a large count before applying.

Then give the research step the same fresh data: copy the downloaded CSV from `data/tmp/` over `research/data/imb_people_groups.csv` in the people-groups repo. Without this the research prompt is built from the Doxa record instead, which works but carries less detail.

## Step 3 - Research, prompts, review, upload

Each new group needs a research dossier, 365 English prompts, a theological review, and an upload into its `day_in_life` library. Run the `task-progresser` skill in Claude Code from `campaigns-sever`, one group per run:

```text
/task-progresser
```

It calls the onboarding-status endpoint, reconciles against the files in `../people-groups/`, picks the next group with work outstanding, and runs one step: research (Sonnet, web research into `research/findings/{slug}.md`), prompts (Sonnet, into `day-in-the-life/prompts/{slug}.csv`), review (Opus, into `day-in-the-life/reviews/{slug}.md`), or upload:

```bash
bun run scripts/import-dinl.ts --url https://pray.doxa.life --key dxk_... --slug {slug}
```

Re-invoke the skill until discovery reports nothing outstanding. To see the queue without advancing it:

```bash
python3 .claude/skills/task-progresser/discover.py --api-key dxk_... --base-url https://pray.doxa.life
```

For many groups at once, the people-groups repo's orchestrator docs (`research/docs/Research Prompt.md`, `day-in-the-life/docs/generate-prompts.md`, `day-in-the-life/docs/review-prompts.md`) run batches; its README is the manual. Either way, add a row to that repo's `todo.csv` for each new group (name, slug, Doxa id as `campaign_id`, country, religion) so the trackers stay complete.

Never re-upload English with `import-dinl.ts` into a library that already has translations, because the import replaces all content. Use `day-in-the-life/scripts/upload-translations.ts --slug {slug} --include-english true` from the people-groups repo, which merges.

## Step 4 - Adoption assets

Send the designer the link **https://pray.doxa.life/admin/onboarding**. It lists every group with outstanding work: prompts pending, description translations pending, and each `needs:` tag. The designer produces the six assets and uploads them to storage. When an asset is confirmed, remove its `needs:` tag on the group's detail page (the X on the tag chip). Either the designer, with admin access, or another admin can do this.

## Step 5 - Translation (optional)

**Descriptions** are cheap and always done: the import does it automatically, and a manual group gets it from the translate button in Step 1.

**Day in the Life prompts** are optional. Translating 365 lines into ten languages costs real money per group, and only about 180 of the 2,122 groups have it. Groups with committed prayer partners come first. Two routes:

- **In the app.** `/admin/people-groups/[id]/content`, open the library, **Translate All Content**. Runs as a background job through OpenRouter and bills per token. Convenient for one group.
- **In the people-groups repo.** `day-in-the-life/docs/translate-signed-up-groups.md` drives Claude Code agents with no per-token API cost, then `upload-translations.ts` merges the result. Better for batches. Add a row to `day-in-the-life/translation_progress.csv` first.

## Step 6 - Spot checks

- `/admin/people-groups/[id]`: description in English plus translations, IMB fields populated, the `needs:` tags present until cleared.
- `/admin/people-groups/[id]/content`: the Day in the Life library holds 365 days of English.
- `/admin/onboarding`: the group has dropped off prompts-pending and translation-pending; it stays listed until every `needs:` tag is cleared.
- The public page `/{slug}` renders with the description and photo.

## Quarterly, not monthly

The `imb-update` skill syncs changed IMB fields into existing records, flips engagement status, and archives groups IMB dropped. It runs on its own schedule and is not part of this checklist.

## Reference

- Create endpoint used by the import: `POST /api/admin/people-groups` (requires a PEID; the reports flow is the only PEID-less path)
- Tags: `PUT /api/admin/people-groups/[id]` with `{ tags: [...] }`
- Onboarding dashboard data: `GET /api/admin/people-groups/onboarding-status`
- Description translation: `POST /api/admin/people-groups/translate-field` (SSE)
- Suggestions: `POST /api/updates` (public), `/api/admin/people-group-reports/[id]/approve|accept|deny|link`
- Library upload: `POST /api/admin/libraries/import` with `library_key: 'day_in_life'`
- Skills: `.claude/skills/imb-import`, `.claude/skills/task-progresser`, `.claude/skills/imb-update`
