# Task Progresser

Advance outstanding onboarding work for a newly added people group: research dossier, 365 prayer prompts, theological review, prompt upload. **One people group per invocation.**

## When to use

After the `imb-import` skill has created new groups, or after an approved `/updates` suggestion has created a manual one, use this skill to walk a single people group through:

1. Research dossier (`research/findings/{slug}.md` in the people-groups repo)
2. 365 prayer prompts (`day-in-the-life/prompts/{slug}.csv`)
3. Theological review (`day-in-the-life/reviews/{slug}.md`)
4. Upload to the campaigns server as the group's `day_in_life` library

Prompt translation is a separate, optional, paid step — `/translate-prompts` in the people-groups repository. Descriptions arrive in English only and are translated in `/onboard-people-groups` step 4. Adoption assets are rendered by the resource pipeline's `/group-assets` skill, which also clears the `needs:X` tags.

## Required environment

- An admin API key with `people_groups.edit` and `content.edit` permissions (`Authorization: Bearer dxk_*`), read from `.env` per target: `PRODUCTION_ADMIN_API_KEY` for prod, `ADMIN_API_KEY` otherwise. Ask for a key only when the script reports the variable is unset, then pass `--api-key`.
- A checkout of the people-groups repository (https://github.com/doxa-life/people-groups), registered with `/doxa-repos`. Each stage below is one of that repository's own skills; every repo path is relative to its checkout root, and everything runs from there.
- The campaigns-sever dev server running, OR a production base URL if pushing live

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

### Step 1 - Discover what needs work

```bash
python3 .claude/skills/task-progresser/discover.py --target prod [--api-key KEY] [--repo PATH] [--limit N]
```

This prints one line per people group with outstanding work, sorted so research-pending groups come first. Each line shows the next required step:

- `RESEARCH` - no dossier locally, no prompts on the server
- `PROMPTS` - dossier exists, prompts CSV not generated
- `REVIEW` - prompts CSV exists, theological review (`reviewed` in `todo.csv`) has not run
- `UPLOAD` - reviewed, prompts CSV exists locally, server has no `day_in_life` content
- `TRANSLATE` - descriptions missing translations (write them yourself against `GET /api/glossary/{lang}` and save with `PUT /api/admin/people-groups/[id]`; the detail page's translate button is the admin UI's OpenRouter path, not this one)
- `NEEDS_TAG` - only adoption-asset tags remain; the resource pipeline's `/group-assets` skill handles those

Pick **one** group to advance. Default to the top of the list (research-pending first).

### Step 2 - Research (if step is RESEARCH)

**This step is the people-groups repository's `research-groups` skill.** Read
`.claude/skills/research-groups/SKILL.md` in that checkout and follow its
single-group path with the checkout as the working directory. It owns the
subagent prompt and the tracker update.

In short: build the demographic block with
`python3 research/scripts/build_research_prompt.py {slug} --api-key KEY`, always
passing the key so a newly imported group resolves, dispatch one Sonnet
subagent, and mark `research_done`. The agent does the web research, reads and
extends `research/cache/`, and writes `research/findings/{slug}.md`.
3. Ensure `todo.csv` has a row for the slug and mark `research_done = yes`. Newly added groups will not be in `todo.csv` yet: append a row with name, slug, the group's Doxa id as `campaign_id`, country, and religion before marking it done.

### Step 3 - Prayer prompts (if step is PROMPTS)

**This step is the people-groups repository's `generate-prompts` skill.** Read
`.claude/skills/generate-prompts/SKILL.md` in that checkout and follow its
single-group path with the checkout as the working directory. It owns the
subagent prompt, the validation thresholds and the tracker update, so this skill
does not restate them and cannot drift from them.

In short: build the demographic block, fill three placeholders in the skill's
`reference/subagent-prompt.md`, dispatch one Sonnet subagent in the background,
validate the CSV, mark `prompts_done`.

### Step 4 - Theological review (if step is REVIEW)

**This step is the people-groups repository's `review-prompts` skill.** Read
`.claude/skills/review-prompts/SKILL.md` in that checkout and follow its
single-group path with the checkout as the working directory. It owns the
subagent prompt, the validation checks and the tracker update.

In short: fill two placeholders, dispatch one Opus subagent in the background,
check the report exists and the prompts file is still intact, and mark
`reviewed`. The agent grades all 365 lines and revises anything below an A in
place. Review status is a local-only signal; the campaigns server only tracks
the uploaded library.

### Step 5 - Upload (if step is UPLOAD)

From this project:

```bash
bun run scripts/import-dinl.ts --url BASE_URL --key API_KEY --slug {slug}
```

The script reads `todo.csv`, finds the row for the slug, calls `POST /api/admin/libraries/import` with `library_key: 'day_in_life'`, and marks `upload_done = yes` on success. Without `--slug` it uploads every pending row in order (`--limit N` caps the count).

A library that already holds translations must not be re-uploaded this way, because the import replaces all content. Use `day-in-the-life/scripts/upload-translations.ts --slug {slug} --include-english true` from the people-groups checkout instead, which merges.

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
- Does not translate descriptions; `/onboard-people-groups` step 4 covers them.
- Does not translate prayer prompts (optional and paid; `/translate-prompts` in the people-groups repository).
- Does not produce or upload adoption assets; the resource pipeline's `/group-assets` skill does, and clears the `needs:X` tags.
- Does not work on more than one group per invocation. The operator re-runs to advance the next.
