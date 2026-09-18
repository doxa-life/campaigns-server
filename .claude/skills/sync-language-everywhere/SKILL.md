---
name: sync-language-everywhere
description: Propagate a glossary change for one language across every DOXA project — the campaigns server, the marketing site, the mobile app, the resource pipeline and the people-groups prompts — driving each repository's own sync-language skill. Use after a reviewer confirms or changes terminology. Invoke with /sync-language-everywhere <code>.
user-invocable: true
---

# Sync a language everywhere

Argument: the language code.

Reviewers edit the glossary live through a magic link, so the database moves
without anything else moving. This is what brings the repositories back into
line with it. Each repository's own `sync-language` skill holds the detail; this
one owns the order, the shared rules and the report.

## 1. See what moved

```bash
python3 .claude/skills/language-status/language_status.py {code}
python3 .claude/skills/doxa-repos/repos.py list
curl -s https://pray.doxa.life/api/glossary/{code}?format=markdown
```

Read the glossary in full before touching any repository, `notes` included:
register, prayer-prompt verbs, acronym policy, number format, script and name
rules. They decide how the terms are applied, and they are what a single
repository's skill is most likely to get wrong on its own.

A `DRIFT:` line on the campaigns-server row means `config/languages.ts`
disagrees with the glossary about the Bible edition. The glossary is right.

A language that is not in the glossary cannot be synced. Stop and say so.

## 2. The rule every repository follows

Some of this text was written by a human reviewer and some by a machine, and
they are not treated alike.

**Precedence, highest first:** the reviewer's later notes, then the glossary,
then wording a human reviewer approved, then anything AI-generated.

On a surface a reviewer worked on, change only a glossary term or an outright
defect, and keep their register and phrasing. Where the glossary contradicts a
reviewed sentence, change the term inside that sentence and leave the rest of it
alone.

Which surfaces were human-reviewed is usually not recorded in any repository.
**Ask** before assuming a file is machine output to rewrite freely.

## 3. Run each repository

For each: read `<checkout>/.claude/skills/sync-language/SKILL.md`, follow it with
that checkout as the working directory, and collect its report.

| Repository | What it holds for a language |
|---|---|
| campaigns server (this one) | Locale files, the people-group description phrases, the language entry |
| `marketing` | Site strings, map widget locales and bundles, the `/terms` edition, published CMS pages |
| `mobile` | The ARB file and its generated localizations |
| `pipeline` | Prayer-card, certificate and social-share captions, and the number format |
| `people-groups` | The translation instructions, and a report on what is already translated the old way |

They are independent, so a failure in one is reported and the rest continues.

Two of these have consequences the others do not:

- **CMS pages on doxa.life go live the moment they save.** There is no draft
  layer for a published page. Say this to the person before the first write.
- **The resource pipeline republishes downloadable artwork.** Rendering is
  local; `deploy` is what changes what the public gets, and it is asked for by
  name and confirmed.

**Translated prayer prompts are never bulk-retranslated by this skill.** There
are 365 lines per group across thousands of groups. The people-groups skill
reports what is out of line and what a fix would cost; acting on it is a
separate decision.

## 4. Report

One section per repository: terms changed, defects fixed, what was deliberately
left. Then two lists that matter more than the rest:

- **Live now** — CMS pages and any deployed artefacts. These are not
  uncommitted changes; they are already public.
- **Questions for the reviewer** — every place the glossary was silent,
  self-contradictory, or at odds with the language's reference Bible.

Repository changes stay uncommitted.
