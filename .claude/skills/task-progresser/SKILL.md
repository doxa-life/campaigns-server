# Task Progresser

Advance outstanding onboarding work for newly imported people groups: research dossier, 365 prayer prompts, prompt upload. **One people group per invocation.**

## When to use

After running the `imb-import` skill (or after a colleague has manually created a custom people group via the admin UI), use this skill to walk a single people group through:

1. Research dossier generation (`dinl/people-group-findings/{slug}.md`)
2. 365 prayer prompts generation (`dinl/prompts/{slug}.csv`)
3. Upload to the campaigns server library system (`day_in_life` library)

This skill does NOT handle DeepL translation (that's fired by `imb-import` after creation) and does NOT produce adoption assets (those are uploaded by the colleague — track via `needs:X` tags).

## Required environment

- An admin API key with `people_groups.edit` and `content.edit` permissions (use `Authorization: Bearer dxk_*`)
- The sibling `people-groups/` repo cloned at `../people-groups/` relative to this project
- The campaigns-sever dev server running, OR a production base URL if pushing live

## Process

### Step 1 — Discover what needs work

```bash
python3 .claude/skills/task-progresser/discover.py --api-key API_KEY [--base-url URL] [--limit N]
```

This prints one line per people group with outstanding work, sorted so research-pending groups come first. Each line shows the next required step:

- `RESEARCH` — no findings markdown locally, no prompts on server
- `PROMPTS` — research is done locally, but prayer prompts CSV not generated
- `REVIEW` — prompts CSV generated but theological review (`reviewed` in `todo.csv`) hasn't run yet
- `UPLOAD` — review complete, prompts CSV exists locally but server has no `day_in_life` library content
- `TRANSLATE` — descriptions missing translations (operator should re-run `imb-import`'s batch translate manually if this lingers)
- `NEEDS_TAG` — only colleague-produced asset tags remain; nothing for this skill to do

Pick **one** group to advance. Default to the top of the list (research-pending first).

### Step 2 — Research (if step is RESEARCH)

Follow `../people-groups/dinl/Research Prompt.md`. Summary:

1. From `../people-groups/`:
   ```bash
   python3 dinl/build_research_prompt.py {slug} --api-key KEY [--base-url URL]
   ```
   The script resolves slug→PEID via the admin API (`/api/admin/people-groups`) and pulls demographic data from `dinl/imb_people_groups.csv`. **The `--api-key` is required for any group imported after the legacy `UUPG_peoplegroups_list_export.csv` was last refreshed** — i.e. anything created via the recent `imb-import` runs. `DOXA_API_KEY` / `DOXA_BASE_URL` env vars are honored if CLI flags are omitted.
2. Dispatch a Sonnet subagent (`model: "sonnet"`) with the research prompt as input. The agent performs web research and writes the findings dossier to `dinl/people-group-findings/{slug}.md`.
3. After it completes, ensure `../people-groups/dinl/todo.csv` has a row for the slug and mark `research_done = yes`. Newly imported groups won't already be in `todo.csv` — append a row with the slug, name, country, religion, and the prod people-group `id` as `campaign_id` before marking it done. Future runs will then pick up the local research/prompts state correctly.

### Step 3 — Prayer prompts (if step is PROMPTS)

Follow `../people-groups/dinl/Prayer Fuel AI Prompt v6.md`. Summary:

1. Inline the pre-extracted demographic block into the v6 SUBAGENT PROMPT TEMPLATE (replacing `[PEOPLE GROUP NAME]`, `[SLUG]`, and `[INSERT DEMOGRAPHIC DATA HERE]`). The subagent reads the dossier, style exemplars (`dinl/style-exemplars.md`), and coverage checklist (`dinl/base-prompts.md`) directly from disk — do NOT inline those.
2. **Dispatch an Opus subagent in background** (`model: opus`, `run_in_background: true`). Background mode avoids the stream-idle timeout that affects long single-turn generations. Opus produces higher-quality, more varied prose than Sonnet for this generation task.
3. Subagent saves output to `dinl/prompts/{slug}.csv`.
4. After completion, validate per v6 orchestrator instructions:
   - Exactly 365 lines (`wc -l`)
   - Time-of-day count between 98–102 (lines containing dawn/first light/daybreak/sunrise/morning/midday/noon/afternoon/evening/dusk/twilight/sunset/nightfall/night)
   - No em-dashes
   - Lines with commas wrapped in double quotes
5. If validation fails, dispatch a fix agent. Once it passes, mark `prompts_done = yes` for that slug in `todo.csv`.

### Step 4 — Theological review (if step is REVIEW)

Follow `../people-groups/dinl/Master Checking.md`. Summary:

1. Inline the `[PEOPLE GROUP NAME]` and `[SLUG]` into the Master Checking SUBAGENT PROMPT TEMPLATE.
2. **Dispatch an Opus subagent in background** (`model: opus`, `run_in_background: true`). The agent reads all 365 prompts, grades each (A–F) against Protestant orthodox criteria, revises in place anything below A, and saves a report to `dinl/reviews/{slug}.md`.
3. After completion, validate:
   - Review file exists at `dinl/reviews/{slug}.md` and contains the grade-distribution table
   - Prompts CSV still has exactly 365 lines
   - Still 0 em-dashes
   - Lines with commas still wrapped in double quotes
4. If validation passes, mark `reviewed = yes` for that slug in `todo.csv`. (Review status is a local-only signal — no server-side tag needed; the campaigns server only tracks the rolled-up "Day In The Life Prompts" presence via the upload step.)

### Step 5 — Upload (if step is UPLOAD)

Reuse the existing battle-tested upload script:

```bash
bun run scripts/import-dinl.ts --url BASE_URL --key API_KEY --limit 1
```

The script reads `todo.csv`, picks the first PG with `upload_done != 'yes'` that has prompts CSV present, calls `POST /api/admin/libraries/import` with `library_key: 'day_in_life'`, and updates `todo.csv` (`upload_done = yes`) on success.

If you want to upload a specific slug rather than the first one in the queue, temporarily mark the others as already-done in `todo.csv`, or edit `import-dinl.ts` filters.

### Step 6 — Verify and report

After the chain completes for one PG:
- Confirm `/admin/onboarding` shows the PG dropping off the prompts-pending list (the dashboard re-queries on refresh).
- Print a one-line summary of what advanced and what's left for that PG (likely TRANSLATE or NEEDS_TAG only).
- Re-run discovery to see what to pick next, but **stop here unless the operator asks for another iteration** — this skill is one PG per invocation.

## Re-runnability

Every step is idempotent against existing local state:
- If the findings markdown already exists, skip research.
- If the prompts CSV already exists, skip prompt generation.
- If `upload_done = yes` in `todo.csv`, skip upload.

So re-running the skill on a PG that's mid-flight will pick up where the prior session left off.

## What this skill does NOT do

- Does not create new people-group records (use `imb-import` or the admin UI).
- Does not translate descriptions (fired by `imb-import` via batch translate).
- Does not translate prayer prompts (English-only by current scope).
- Does not produce or upload adoption assets — those are colleague-handled via `needs:X` tags.
- Does not work on more than one PG per invocation. Operator re-runs to advance the next.
