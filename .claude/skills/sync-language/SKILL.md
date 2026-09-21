---
name: sync-language
description: Bring this repository's existing strings for one language into line with the current database glossary — locale files, the people-group description phrases, and the config/languages.ts entry. Use after a reviewer confirms or changes terminology. Invoke with /sync-language <code>.
user-invocable: true
---

# Align the campaigns server with the glossary

Argument: a language code this repository already carries. For a language that
is not here yet, use `/add-language`.

## 1. Read the glossary

```bash
curl -s https://pray.doxa.life/api/glossary/{code}?format=markdown
```

The JSON form at the same path carries the same content with each term's status
and annotations. Both include `notes`: the language's register, its
prayer-prompt verbs, acronym policy, number format and script rules. Read those
first — they decide how the terms below are inflected and addressed.

A `draft` term is still authoritative. Terminology nobody has ruled on yet is
applied consistently and corrected later; a term left to each file's own
invention drifts differently everywhere.

## 2. Check the language entry against the glossary

`config/languages.ts` is derived from the glossary record. Correct it where the
two disagree:

| Glossary field | `config/languages.ts` |
|---|---|
| `language.name_en` | `name` |
| `language.name_local` | `nativeName` |
| `language.text_direction` | `dir` (omitted when `ltr`) |
| `language.bible_id` | `bibleId` |

`flag`, `translationName`, `translationModel` and `enabled` are this
repository's own and are not in the glossary. Leave them.

Changing `bibleId` changes which edition verses are fetched in. Check
`data/bibles/{bibleId}.json` exists; if it does not, say so in the report rather
than fetching it as a side effect.

## 3. Sweep the locale files

`i18n/locales/{code}/common.json` and `people-groups.json`. Skip
`languages.json` and `bible.json` unless a language or book name is wrong.

- Replace deviant terms with the glossary wording, longest phrase first so
  compounds do not get half-replaced.
- Script the replacements with explicit old-to-new pairs and assert each pair
  matches at least once, so a typo fails loudly instead of silently doing
  nothing.
- Keys never change. Only values.
- Apply the notes: register, acronyms, thousands separator, how a year is
  written.
- A bare acronym in a string (UPG, UUPG, CPM) takes the glossary's
  `acronym_translation`, which is the English acronym unless the reviewer chose
  another; the wording itself never carries it in parentheses.
- Validate the JSON afterwards and confirm the key set is unchanged.

Then `grep` `app/`, `server/` and `config/` for the old wording, in case a term
is hardcoded outside the locale files.

## 4. The people-group description

`peopleGroups.descriptionTemplates.status*` in `people-groups.json` holds four
sentence-form phrases: `statusEngaged`, `statusUnengaged`,
`statusEngagedUnreached`, `statusUnengagedUnreached`. The composer in
`server/utils/app/people-group-description.ts` drops one into a sentence, so
each has to read as a predicate in this language, with the right number and
agreement. Read the generated sentence, not just the phrase:

```bash
bun -e "import('./server/utils/app/people-group-description.ts').then(m => console.log(m.generatePeopleGroupDescription(pg, '{code}')))"
```

## 5. What not to change

Some of this text was written by a human reviewer and some by a machine. They
are not treated alike.

**Precedence, highest first:** the reviewer's later notes, then the glossary,
then wording a human reviewer approved, then anything AI-generated.

On a surface a reviewer worked on, change only a glossary term or an outright
defect. Keep their register, their phrasing and their choices, even where a
different wording would read better — they were reviewed and you were not. If
the glossary contradicts their wording, the glossary wins inside that sentence,
and the rest of the sentence stands.

Ask whether this language's strings were reviewed if you do not know. The answer
is usually not in the repository.

## 6. Report

Per file: terms changed, defects fixed, anything deliberately left, and any
question only a reviewer can settle. Leave every change uncommitted.

Verify with `npx nuxi typecheck` for any `.ts` you touched. Two pre-existing
errors in `server/utils/tracking.ts` are not yours.
