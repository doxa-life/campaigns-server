---
name: add-language-everywhere
description: Roll a new language out across every DOXA project — the campaigns server, the marketing site, the mobile app, the resource pipeline and the people-groups prompts — driving each repository's own add-language skill in order, committing and pushing each repository once the person agrees, and waiting for each deploy so the language ends switched on and live. Use when a language's glossary has been reviewed and it is time to put it in code. Invoke with /add-language-everywhere <code>.
user-invocable: true
---

# Add a language everywhere

Argument: the language code.

This runs each repository's own `add-language` skill in turn. Those skills hold
the detail; this one owns the order, the preconditions and the report.

## 1. Preconditions

```bash
python3 .claude/skills/language-status/language_status.py {code}
python3 .claude/skills/doxa-repos/repos.py list
python3 .claude/skills/add-language-everywhere/rollout.py --target prod check
```

**Stop if the rollout `check` fails.** See "Progress on /admin/onboarding"
below: ask for a working key and wait.

**Stop if the glossary row says `MISSING`.** A language is born in the glossary
at `/admin/glossary` on pray.doxa.life, where an admin adds it, AI drafts its
terms, and a reviewer confirms them through a magic link. Nothing here should
run before that. Strings written against a glossary that does not exist have to
be rewritten when it does.

**If the glossary has terms but no translation notes,** say so and ask whether
to continue. The notes carry the register, the prayer-prompt verbs, the acronym
policy and the number format. Without them every repository guesses separately,
which is the drift this whole arrangement exists to prevent.

**If a repository is not registered,** ask the person for its checkout path and
record it with `/doxa-repos`. Never guess a path and never search the filesystem
for one. A repository they do not have is a repository this rollout skips, said
plainly in the report.

## Progress on /admin/onboarding

The rollout shows on the Languages tab of `/admin/onboarding`. Report to it as
you go, with the same `--target` as the glossary:

```bash
R=.claude/skills/add-language-everywhere/rollout.py
python3 $R --target prod check            # before any repository is touched
python3 $R --target prod start {code}     # once the preconditions pass
python3 $R --target prod report {code}    # stores the language-status survey
```

**Stop and wait if `check` fails.** Reporting is part of the rollout, not
optional: do not skip it, and do not start any repository until `check` prints
`ok`. The admin key comes from `.env` as for `/doxa-context`
(`PRODUCTION_ADMIN_API_KEY` for prod, `ADMIN_API_KEY` for local).

- **Key not set, or HTTP 401** (missing, revoked, or issued for another
  server): tell the person to sign in at `/admin/profile` on that server as an
  admin, create an API key (it starts with `dxk_` and is shown once), and put it
  in `.env` under the variable `check` named. Then wait for them to say it is
  there and run `check` again.
- **HTTP 403**: the key's user lacks `glossary.view`, `glossary.manage` or
  `people_groups.edit`. Ask for a key from an admin account, then run `check`
  again.
- **The API is not deployed there**: say so and ask whether to deploy first or
  to target a server that has it.

Never edit `.env`, never ask for the key in the conversation, and never print
it. The same applies mid-run: if any `$R` call fails with 401 or 403, stop
where you are, ask as above, and resume from the same step once `check` passes.

**A rollout that already exists.** Run `python3 $R --target prod show {code}`
first and pick up from the first task that is not done, skipping every step
whose task is already done or skipped.

**Ask once, at the start,** whether to translate the three shared prayer
libraries too (step 4): about 1,100 days, translated by Claude. After that, the
only questions are the commit-and-push confirmations in section 2 and anything
that fails.

## 2. Git: commit and push each repository, with the person's go-ahead

The rollout ends with the language live, so each repository's change is
committed and pushed as its step finishes, but never without asking. Before
touching a repository:

- It is on its default branch (`master` or `main`), up to date
  (`git pull --ff-only`), and has no uncommitted changes. If it has any, stop
  and ask: never stash, discard or commit someone else's work.

After its `add-language` skill finishes and its checks pass:

- Show the person the repository, the files changed (`git status --short` and a
  one-line summary of each), and the commit message you propose, like
  `add Finnish (fi)`. Ask whether to commit and push, and wait for the answer.
  Committing and pushing are separate: the person may want only the commit.
- On a yes: stage only the files that step changed, commit,
  `git pull --rebase`, then `git push`. Never force-push. If the rebase
  conflicts or the push is rejected, stop and ask.
- On a no, or a commit without a push: note that on the task, and skip the
  steps that need this repository deployed, naming them in the report.
- Put the short commit hash in the task's note.

While waiting for an answer about one repository, do not start the next.

A push deploys the campaigns server and the marketing site in 5 to 10 minutes.
Wait for the deploy where a later step needs it:

```bash
python3 $R --target prod wait-live {code} --site campaigns   # pray.doxa.life/api/languages lists it switched on
python3 $R --target prod wait-live {code} --site marketing   # https://doxa.life/{code}/ answers 200
```

Each waits up to 15 minutes. If it times out, carry on with the steps that do
not need that deploy, then ask the person to check the deploy on DigitalOcean
and wait for them before the steps that do.

## 3. Run each step in order

For each repository below: read
`<checkout>/.claude/skills/add-language/SKILL.md`, follow it with that checkout
as the working directory, collect its report, then ask to commit and push as above.

**The language is added switched on** in the campaigns server and the marketing
site. Where a repository's own skill says to add it switched off, override that
and enable it.

Around each step, set its task. The repository keys are `campaigns-server`,
`marketing`, `mobile`, `pipeline` and `people-groups`:

```bash
python3 $R --target prod task {code} marketing running
python3 $R --target prod task {code} marketing done --note "a1b2c3d; common.json complete"
```

Use `failed` with the reason as the note when it fails, and `skipped` when the
repository is not registered.

| Order | Step | Why here |
|---|---|---|
| 1 | campaigns server (this one) | Owns `config/languages.ts`. Everything else reads people-group data and verses through it. Push, and let it deploy while step 1b runs |
| 1b | people-group descriptions | Not a repository: the `descriptions` field in the database, below. Needs step 1's carrier sentence |
| 1c | wait for pray.doxa.life | `wait-live --site campaigns`. Steps 4 and 6 need the deployed language |
| 2 | `marketing` | The public site. Push, then `wait-live --site marketing` and mark `enabled-marketing` done |
| 3 | CMS pages | Needs step 2 live on doxa.life. Section 4 below |
| 4 | shared prayer libraries | Only if the person said yes at the start. `/translate-libraries {code}`, which needs step 1c |
| 5 | `mobile` | Independent. Pushing does not release the app |
| 6 | `pipeline` | Renders artwork from the campaigns server's per-language data, so it needs steps 1b and 1c |
| 7 | `people-groups` | Only registers the language for on-demand prompt translation. Nothing is translated here by this skill |

### 1b. People-group descriptions

Every group's `descriptions` field falls back to English for a language it
does not have, so a card rendered before this step shows sentences like "He
ovat an ethnolinguistic community of China". Translate them yourself, not
through the admin's translate button or `translate-field` endpoint, which go
through OpenRouter.

```bash
D=.claude/skills/add-language-everywhere/descriptions.py
python3 $D --target prod export {code} --out <scratchpad>/descriptions-{code}.jsonl
```

The export holds each distinct English phrase once (a few hundred, shared by
about two thousand groups) and prints the carrier sentences from
`i18n/locales/{code}/people-groups.json`. Translate every line into a `text`
field:

- Ground the terms in `GET https://pray.doxa.life/api/glossary/{code}?format=markdown`
  and follow its translation notes.
- Each phrase is the `{peopleDesc}` predicate. Read it inside both carrier
  sentences and make it grammatical there, in the case and form the sentence
  needs. No leading capital, no closing full stop.
- Keep names of peoples, places and languages as the language writes them.
- Work in batches, and check that every line has a non-empty `text` before
  saving.

```bash
python3 $D --target prod import {code} --file <scratchpad>/descriptions-{code}-translated.jsonl
```

Import saves each phrase to every group that uses it, keeping the other
languages and any existing translation in this language. It ends with the
number of groups still without the language, which should be 0. The
`people-group-descriptions` task counts itself on `/admin/onboarding`. If it
is not complete, stop before step 6 and say why.

Stop the whole rollout if step 1 fails. A failure later is reported and the rest
continues, apart from the steps that need it.

## 4. CMS pages

The CMS can create a page translation only in a language that is live on
doxa.life, which it is once step 2's `wait-live` passes. Translate the pages by
default; skip them only when the person asked not to, marking `cms-drafts` as
`skipped` with that as the note.

Page through `list_pages` and call `translate_page` for each page with
`target_locales: ["{code}"]`, `status: "draft"` and `overwrite: false`, so a page
that already has this language is left alone. Each page costs model calls.
Nothing is published: an editor reviews and publishes each draft, which is the
`cms-pages` task. If the first page is rejected because the locale is not live,
stop the CMS step and say so. Otherwise mark `cms-drafts` done with the count of
pages translated, skipped and failed as the note.

## 5. What this does not do

Name each of these in the report rather than doing it. Apart from adoption
artwork, each is a task on the rollout's checklist, where an admin ticks it once
done; the content ones are counted there automatically.

- **CMS pages** are translated as drafts, not published.
- **Day in the Life prompts** are translated per group, on demand, and paid for
  per group.
- **Adoption artwork** for a language with no cut template is a request to the
  designer.
- **App store listings** are a market decision, not a strings decision.
- **The playbook** in this language.
- **The homepage video** on doxa.life, which is on Vimeo.

## 6. Report

One section per repository: what was added, its commit, whether it is live,
what is still English, what needs a person. Then the outstanding questions for the reviewer in one list, because
they are usually the thing that actually blocks a language going live.

Finish by running `/language-status {code}` again and showing the result, so the
before and after are both visible, then `python3 $R --target prod report {code}`
so the page carries the same survey, and link
`https://pray.doxa.life/admin/onboarding?tab=languages`.
