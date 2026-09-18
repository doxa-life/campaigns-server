---
name: add-language
description: Bring a new language into the campaigns server — the config/languages.ts entry built from its glossary record, the four locale files, its name in every other locale, and the checks that decide when it can be switched on. Use after the language has a glossary with reviewed terms. Invoke with /add-language <code>.
user-invocable: true
---

# Add a language to the campaigns server

Argument: the language code. The language must already exist in the glossary;
that is where it is born, and this repository follows it.

## 1. Refuse to start without a glossary

```bash
python3 .claude/skills/language-status/language_status.py {code}
```

If the glossary row says `MISSING`, stop and say what has to happen first: an
admin adds the language at `/admin/glossary` on pray.doxa.life, drafts its
terms, and sends a reviewer a magic link. Terminology is decided there. A
locale file written before that has to be rewritten afterwards.

If the glossary exists but has no translation notes, say so and ask whether to
continue. Without them the register and the number format are guesses.

## 2. Create the `config/languages.ts` entry

Build it from the glossary record, read from
`https://pray.doxa.life/api/glossary/{code}`:

| Glossary field | Entry field |
|---|---|
| `language.name_en` | `name` |
| `language.name_local` | `nativeName` |
| `language.text_direction` | `dir: 'rtl'`, omitted when `ltr` |
| `language.bible_id` | `bibleId` |
| `language.bible_translation` | `bibleLabel`, only when it differs from the id |

Ask the person for the two fields the glossary does not hold:

- `flag` — the emoji shown in the language selector.
- `translationName` — only when the plain English name is ambiguous in a
  translation prompt, as Portuguese, Chinese and Arabic are.

Add the entry in the array with `enabled: false`. The language is then available
to the API, to description translation and to content work, while the public UI
stays unchanged until its strings exist.

**A language with no `bible_id` in the glossary.** Verses are fetched per
language from bolls.life, and there is no edition to fetch from. Stop and ask
before registering it: either the reviewer has not yet reported which Bible
their churches use, which is a question for them, or bolls carries none for this
language, which is a decision about whether verses fall back to English.

**The Bible dump.** Check `data/bibles/{bibleId}.json`. If it is absent, say so
in the report; adding it is a separate, deliberate step.

## 3. Write the locale files

Four files in `i18n/locales/{code}/`, each with exactly the key structure of its
English counterpart:

| File | Contents |
|---|---|
| `common.json` | Interface strings |
| `people-groups.json` | People group fields, options, description phrases |
| `languages.json` | Every language name, as spoken in this language |
| `bible.json` | Book names |

Translate from the English files with the glossary and its notes in front of
you. Do it directly rather than through the app's translation endpoint: this is
source text, it wants care, and there is no per-token cost this way.

- Never add or drop a key.
- `peopleGroups.descriptionTemplates.status*` are sentence-form predicates, not
  labels. Read the composed sentence, not the phrase alone.
- `languages.json` is long. It is the one file worth translating in batches.
- Validate every file and confirm its key set matches English exactly.

## 4. Add this language's name to the other locales

Every other `i18n/locales/*/languages.json` needs an entry for the new code, so
the language appears with a proper name in each of them. Work from the language
name as that locale would write it.

## 5. Switch it on

Set `enabled: true` once the four locale files are complete. Then:

- `npx nuxi typecheck`
- `bun run dev`, open the site in the new language, and read a public page, the
  prayer content page, and a sign-up form end to end.
- For a right-to-left language, check the layout mirrors and that no Latin
  fragment is reordered.

## 6. Hand back what only the admin can do

These are not repository changes. Name them in the report:

- **People group descriptions** — `/admin/people-groups`, the description
  field's translate button, or the batch endpoint. Costs tokens.
- **Shared prayer libraries** — the admin's translate buttons per library. This
  is the expensive one; a superadmin decides when to run it.
- **Day in the Life prompts** — per group and optional. The people-groups
  repository's own `/add-language` covers it.
- **Verses** — the Bible edition has to exist in the app before verse blocks
  render in this language.

## 7. Report

What was added, what is still empty, what needs an admin, and anything a
reviewer must answer. Leave every change uncommitted.
