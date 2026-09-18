---
name: language-status
description: Report where one language stands across every DOXA surface — the database glossary, the campaigns server, the marketing site, the mobile app, the resource pipeline, and the people-groups prompts. Use before starting or continuing work on a language, or to answer "is X live yet?". Read-only. Invoke with /language-status <code>.
user-invocable: true
---

# Where a language stands

```bash
python3 .claude/skills/language-status/language_status.py ro
python3 .claude/skills/language-status/language_status.py ro --json
```

Run from the campaigns server checkout. Reads files and makes public GET
requests; changes nothing.

Paths to the other repositories come from the `doxa-repos` registry. A
repository that is not registered prints `-` with its GitHub URL, and the survey
of that surface is simply absent rather than guessed. Register it with
`/doxa-repos` and run again.

## Reading the report

`glossary` is the first row because it governs the rest. The glossary at
`/admin/glossary` on pray.doxa.life is where a language's terminology, its Bible
edition and its translation notes are decided; every other surface follows it.

- **`glossary MISSING`** — nothing else should be started. Adding the language
  to the glossary is an admin action in the browser, not something a skill does.
- **`glossary ok` with no translation notes** — the terms are there but the
  language's register, prayer-prompt verbs, acronym policy and number format are
  not. Expect each surface to have made its own choices; say so in the report.
- **`DRIFT:` on the campaigns-server row** — the Bible edition in
  `config/languages.ts` disagrees with the glossary. The glossary is right; the
  code entry is what gets corrected.

The other rows say what each surface holds today. `MISSING` means the language
is absent there, which is the normal state before `/add-language` runs.

## What the report cannot see

- Whether a locale file's strings are *good*, only whether they are present and
  how many there are against English.
- CMS page translations on doxa.life, which live in that site's database. Check
  those with the doxa-cms MCP server.
- Prayer content and people-group description translations, which live in the
  campaigns server database. Check those in the admin.

## Next steps

| Report says | Do |
|---|---|
| No glossary | Ask an admin to add the language at `/admin/glossary`, draft its terms, and send a reviewer a magic link |
| Glossary present, surfaces missing | `/add-language-everywhere <code>` |
| Surfaces present, glossary changed | `/sync-language-everywhere <code>` |
| One surface wrong | Run that repository's own `/add-language` or `/sync-language` |
