---
name: add-language-everywhere
description: Roll a new language out across every DOXA project — the campaigns server, the marketing site, the mobile app, the resource pipeline and the people-groups prompts — driving each repository's own add-language skill in order. Use when a language's glossary has been reviewed and it is time to put it in code. Invoke with /add-language-everywhere <code>.
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
```

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

## 2. Run each repository in order

For each repository below: read
`<checkout>/.claude/skills/add-language/SKILL.md`, follow it with that checkout
as the working directory, and collect its report before moving on.

| Order | Repository | Why here |
|---|---|---|
| 1 | campaigns server (this one) | Owns `config/languages.ts`. Everything else reads people-group data and verses through it, so a language absent here has nothing for the others to translate or draw |
| 2 | `marketing` | The public site. Independent of the rest once the language is registered |
| 3 | `mobile` | Independent. Its thank-you verses need the Bible edition the campaigns server now has |
| 4 | `pipeline` | Renders artwork from the campaigns server's per-language data, so it needs step 1 finished |
| 5 | `people-groups` | Only registers the language for on-demand prompt translation. Nothing is translated here by this skill |

Stop the whole rollout if step 1 fails. A failure later is reported and the rest
continues: the surfaces are independent of each other.

The five repositories are five separate changes. Leave every one uncommitted and
say so; do not open pull requests unless asked.

## 3. What this does not do

Name each of these in the report rather than doing it:

- **Publishing.** The language stays switched off in the campaigns server and
  the marketing site until someone decides it is ready. Flipping it on is that
  person's call.
- **CMS pages** are drafted, not published.
- **People group descriptions and shared prayer libraries** are translated from
  the admin and cost tokens. A superadmin decides when.
- **Day in the Life prompts** are translated per group, on demand, and paid for
  per group.
- **Adoption artwork** for a language with no cut template is a request to the
  designer.
- **App store listings** are a market decision, not a strings decision.

## 4. Report

One section per repository: what was added, what is still English, what needs a
person. Then the outstanding questions for the reviewer in one list, because
they are usually the thing that actually blocks a language going live.

Finish by running `/language-status {code}` again and showing the result, so the
before and after are both visible.
