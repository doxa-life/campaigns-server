---
name: doxa-context
description: Create, read, update and delete the Doxa context portfolios and their sections (https://pray.doxa.life/admin/context/) through the API-key REST API. Use when the user wants something added, changed, removed or looked up in the Doxa context, wants a new portfolio or section, or asks what the context says about a topic. Invoke with /doxa-context <request in plain words>.
user-invocable: true
---

# Doxa context

A context portfolio is one body of organizational knowledge held as markdown
sections and exported verbatim into AI tools. Portfolios live on the campaigns
server at https://pray.doxa.life/admin/context/ and are read and written through
`/api/admin/context/portfolios`, documented in `server/openapi.yaml` under the
Context tag. This skill turns a plain-language request into the right calls.

## First: is the API key set up?

```bash
S=.claude/skills/doxa-context/doxa_context.py
python3 $S --target prod check
```

Run this before anything else. The helper reads the admin key from `.env` at
the repository root, per target: `PRODUCTION_ADMIN_API_KEY` for `prod`,
`ADMIN_API_KEY` for `local`. It prints the variable name it used, never the
value.

- **`ok: key authenticates`** — carry on.
- **`No admin API key for this target: <VAR> is not set`** — stop and tell the
  user how to set it up, in these words:
  1. Sign in at https://pray.doxa.life/admin/profile as an admin and create an
     API key. It starts with `dxk_` and is shown once.
  2. Add `PRODUCTION_ADMIN_API_KEY=dxk_...` to `.env` at the repository root.
  3. Say when it is there.

  Never edit `.env` yourself, never ask the user to paste the key into the
  conversation, and never print or echo a key. `--api-key` exists for a
  one-off run when the user insists on passing one on the command line.
- **HTTP 401** — the key is revoked or was issued for a different server. Ask
  the user for a fresh one, created the same way.
- **HTTP 403** — the key's user lacks a permission. Reading needs
  `context.view`, saving content needs `context.edit`, and creating or deleting
  portfolios and sections needs `context.manage`. The `admin` role has all
  three; `progress_admin` can view and edit but not manage. Say which
  permission is missing (the server names it) and let the user pick a key from
  the right account.

`--target` has no default: `prod` is where the portfolios live, `local` is a
development server on http://localhost:3000, `--base-url` anything else.

## Helper commands

```bash
python3 $S --target prod catalog                     # built-in section keys | title | description
python3 $S --target prod portfolios                  # slug | name | color
python3 $S --target prod portfolio <slug>
python3 $S --target prod create-portfolio --name "DOXA TECH" [--slug doxa-tech] [--color "#7c3aed"] [--sections identity,team | --no-sections]
python3 $S --target prod update-portfolio <slug> [--name "..."] [--color "#..." | --clear-color]
python3 $S --target prod delete-portfolio <slug> --yes

python3 $S --target prod sections <slug>             # key | title | words | last edited | kind | description
python3 $S --target prod add-section <slug> --key decision-log
python3 $S --target prod add-section <slug> --title "Partners" [--description "..."] [--order N]
python3 $S --target prod update-section <slug> <key> [--title "..."] [--description "..."] [--order N]
python3 $S --target prod reorder <slug> key1 key2 key3 ...   # every key exactly once
python3 $S --target prod remove-section <slug> <key> --yes

python3 $S --target prod get <slug> <key> [--out FILE]      # the markdown
python3 $S --target prod put <slug> <key> --file FILE       # replace the markdown
python3 $S --target prod versions <slug> <key>              # id | when | source | who | words
python3 $S --target prod restore <slug> <key> <version_id>
python3 $S --target prod dump <slug> --dir DIR              # every section as DIR/<key>.md
```

`--json` on any command prints the server's response unformatted. Errors print
the HTTP status and the server's message and exit non-zero.

## How the data is shaped

- A portfolio is addressed by its `slug`. Creating one without `--sections`
  gives it every built-in section from the catalog; `--no-sections` gives none.
- The **built-in catalog** is code-owned in `config/context-sections.ts`
  (identity, vision-and-values, team, goals-and-priorities,
  communication-style, personas, tools-and-systems, translation,
  decision-log). Run `catalog` rather than trusting this list. A built-in
  section is added by key; its title and description come from the catalog
  unless `update-section` stores an override.
- A **custom section** is created by title and keyed by the slugified title.
  The key is fixed once the section exists and may not collide with a built-in
  key.
- **Content** is markdown, capped at 100 KB. Every `put` appends a version, so
  nothing is lost; `versions` and `restore` recover earlier text.
- **Removing a section** drops it from the portfolio but keeps its content,
  which resurfaces if a section with the same key is added again. **Deleting a
  portfolio** removes everything in it, for good.
- `reorder` must list every section exactly once; a partial list is rejected.

## Process for a request

1. **Check** the key as above.
2. **Portfolio.** Run `portfolios`. With one, use it. With several, use the one
   the request names or clearly implies; ask only if it is genuinely ambiguous.
3. **Section.** Run `sections` and pick the section whose title and description
   cover the request. Prefer an existing section over a new one. Use
   `add-section` only when nothing fits and the request clearly calls for a new
   section, and say so in the report.
4. **Read.** `get ... --out` into the scratchpad immediately before editing.
   There is no optimistic locking and `put` replaces the whole section, so
   never write from a stale copy.
5. **Edit** the scratchpad file:
   - Change only what the request asks. Keep every other line, heading and
     wording as it is.
   - Match the section's existing structure, heading levels, list style and
     voice.
   - Write factual, timeless prose. The content is exported verbatim into AI
     tools' context, so no "recently", "we just switched" or other change
     narration.
6. **Write.** `put --file`, then `get` again to confirm the change landed.
7. **Report.** One or two sentences: which section changed and what the edit
   was, plus the link
   `https://pray.doxa.life/admin/context/<slug>/sections/<key>`. Do not paste
   the section content back.

For a question or read-only request ("what does the context say about X?"),
stop after step 4 (or `dump` the whole portfolio) and answer from the content.
Write nothing.

If the request spans several sections, repeat steps 4 to 6 per section and
list each in the report.

## Destructive actions

`delete-portfolio` and `remove-section` refuse to run without `--yes`. Confirm
with the user in plain words before passing it, naming the portfolio or section
and what will be lost. Renaming, reordering and content edits are reversible
through versions and need no confirmation beyond the request itself.
