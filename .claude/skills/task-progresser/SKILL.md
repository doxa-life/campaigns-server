# Task Progresser

Advance outstanding onboarding work for a newly added people group: research dossier, 365 prayer prompts, theological review, prompt upload. **One people group per invocation.**

## When to use

After the `imb-import` skill has created new groups, or after an approved `/updates` suggestion has created a manual one, use this skill to walk a single people group through:

1. Research dossier (`research/findings/{slug}.md` in the people-groups repo)
2. 365 prayer prompts (`day-in-the-life/prompts/{slug}.csv`)
3. Theological review (`day-in-the-life/reviews/{slug}.md`)
4. Upload to the campaigns server as the group's `day_in_life` library

Prompt translation is a separate, optional, paid step (see the onboarding runbook). Description translation is fired by `imb-import` after creation, or from the translate button on the detail page for a manual group. Adoption assets are produced by the colleague and tracked with `needs:X` tags.

## Required environment

- An admin API key with `people_groups.edit` and `content.edit` permissions (`Authorization: Bearer dxk_*`)
- The sibling `people-groups/` repo cloned at `../people-groups/` relative to this project. Every repo path below is relative to that repo's root, and its scripts and orchestrator docs must be run from there.
- The campaigns-sever dev server running, OR a production base URL if pushing live

## Process

### Step 1 - Discover what needs work

```bash
python3 .claude/skills/task-progresser/discover.py --api-key API_KEY [--base-url URL] [--repo PATH] [--limit N]
```

This prints one line per people group with outstanding work, sorted so research-pending groups come first. Each line shows the next required step:

- `RESEARCH` - no dossier locally, no prompts on the server
- `PROMPTS` - dossier exists, prompts CSV not generated
- `REVIEW` - prompts CSV exists, theological review (`reviewed` in `todo.csv`) has not run
- `UPLOAD` - reviewed, prompts CSV exists locally, server has no `day_in_life` content
- `TRANSLATE` - descriptions missing translations (fire the batch translate again, or use the detail page's translate button)
- `NEEDS_TAG` - only colleague-produced asset tags remain; nothing for this skill to do

Pick **one** group to advance. Default to the top of the list (research-pending first).

### Step 2 - Research (if step is RESEARCH)

Follow `research/docs/Research Prompt.md`. Summary:

1. From `../people-groups/`:
   ```bash
   python3 research/scripts/build_research_prompt.py {slug} --api-key KEY [--base-url URL]
   ```
   The script looks the slug up through the admin API. When the group's PEID is in `research/data/imb_people_groups.csv` the demographic block comes from that export. Otherwise (a group from a newer IMB file, or a manual group with no PEID) the block is built from the Doxa record and marked as such, so the researcher verifies the basics. `DOXA_API_KEY` / `DOXA_BASE_URL` env vars are honored when the flags are omitted.
2. Dispatch a Sonnet subagent (`model: "sonnet"`) with the doc's subagent template and the demographic block inlined. The agent does web research, reads and extends `research/cache/`, and writes `research/findings/{slug}.md`.
3. Ensure `todo.csv` has a row for the slug and mark `research_done = yes`. Newly added groups will not be in `todo.csv` yet: append a row with name, slug, the group's Doxa id as `campaign_id`, country, and religion before marking it done.

### Step 3 - Prayer prompts (if step is PROMPTS)

Follow `day-in-the-life/docs/generate-prompts.md`. Summary:

1. Inline the demographic block into the SUBAGENT PROMPT TEMPLATE (replacing `[PEOPLE GROUP NAME]`, `[SLUG]`, and `[INSERT DEMOGRAPHIC DATA HERE]`). The subagent reads the dossier, `day-in-the-life/docs/style-exemplars.md`, and `day-in-the-life/docs/prompt-examples.md` from disk; do NOT inline those. For a deaf group, also point it at two earlier deaf-group CSVs such as `deaf-afghans.csv` and `deaf-cambodians.csv`.
2. **Dispatch a Sonnet subagent in background** (`model: "sonnet"`, `run_in_background: true`). Background mode avoids the stream-idle timeout on long generations.
3. Subagent saves output to `day-in-the-life/prompts/{slug}.csv`.
4. Validate per the doc:
   - Exactly 365 lines (`wc -l`)
   - Time-of-day count between 98 and 102 (lines containing dawn/first light/daybreak/sunrise/morning/midday/noon/afternoon/evening/dusk/twilight/sunset/nightfall/night)
   - No em-dashes
   - Lines with commas wrapped in double quotes
5. If validation fails, dispatch a fix agent. Once it passes, mark `prompts_done = yes` for that slug in `todo.csv`.

### Step 4 - Theological review (if step is REVIEW)

Follow `day-in-the-life/docs/review-prompts.md`. Summary:

1. Inline `[PEOPLE GROUP NAME]` and `[SLUG]` into the doc's SUBAGENT PROMPT TEMPLATE.
2. **Dispatch an Opus subagent in background** (`model: "opus"`, `run_in_background: true`). The agent reads all 365 prompts, grades each A to F against Protestant orthodox criteria, revises in place anything below A, and saves a report to `day-in-the-life/reviews/{slug}.md`.
3. After completion, validate:
   - Review file exists at `day-in-the-life/reviews/{slug}.md` and contains the grade-distribution table
   - Prompts CSV still has exactly 365 lines
   - Still 0 em-dashes
   - Lines with commas still wrapped in double quotes
4. If validation passes, mark `reviewed = yes` for that slug in `todo.csv`. Review status is a local-only signal; the campaigns server only tracks the uploaded library.

### Step 5 - Upload (if step is UPLOAD)

From this project:

```bash
bun run scripts/import-dinl.ts --url BASE_URL --key API_KEY --slug {slug}
```

The script reads `todo.csv`, finds the row for the slug, calls `POST /api/admin/libraries/import` with `library_key: 'day_in_life'`, and marks `upload_done = yes` on success. Without `--slug` it uploads every pending row in order (`--limit N` caps the count).

A library that already holds translations must not be re-uploaded this way, because the import replaces all content. Use `day-in-the-life/scripts/upload-translations.ts --slug {slug} --include-english true` from the people-groups repo instead, which merges.

### Step 6 - Verify and report

After the chain completes for one group:
- Confirm `/admin/onboarding` shows the group dropping off the prompts-pending list (the dashboard re-queries on refresh).
- Print a one-line summary of what advanced and what is left for that group (likely TRANSLATE or NEEDS_TAG only).
- Re-run discovery to see what to pick next, but **stop here unless the operator asks for another iteration**. This skill is one group per invocation.

## Re-runnability

Every step is idempotent against existing local state:
- If `research/findings/{slug}.md` exists, skip research.
- If `day-in-the-life/prompts/{slug}.csv` exists, skip prompt generation.
- If `reviewed = yes` in `todo.csv`, skip review.
- If `upload_done = yes` in `todo.csv`, skip upload.

So re-running the skill on a group that is mid-flight picks up where the prior session left off.

## What this skill does NOT do

- Does not create people-group records (use `imb-import` or an approved `/updates` suggestion).
- Does not translate descriptions (fired by `imb-import`, or the detail page's translate button).
- Does not translate prayer prompts (optional and paid; see the onboarding runbook).
- Does not produce or upload adoption assets; those are colleague-handled via `needs:X` tags.
- Does not work on more than one group per invocation. The operator re-runs to advance the next.
