---
name: translate-libraries
description: Translate the shared prayer libraries on pray.doxa.life (Scripture Prayer, Daily Item, People Group of the day Scripture) into one language, with Claude doing the translation against the glossary and the server fetching every verse from that language's Bible. Use when a language needs its shared prayer content, usually offered by /add-language-everywhere once the language is deployed. Invoke with /translate-libraries <code>.
user-invocable: true
---

# Translate the shared libraries

Argument: the language code.

Translate the libraries yourself. The admin's translate buttons and
**Translate All Content** go through OpenRouter and are for people clicking in
the admin, not for this skill.

```bash
L=.claude/skills/translate-libraries/libraries.py
```

## 1. Preconditions

```bash
python3 $L --target prod check {code}
```

**Stop if `check` fails.** Verse blocks are fetched on the server from the Bible
edition in its deployed `config/languages.ts`. A language that is not deployed
there would be saved with English verses. Say so, and say that the
campaigns-server change from `/add-language` has to be deployed first.

The language must also have a glossary:
`GET https://pray.doxa.life/api/glossary/{code}?format=markdown`. Stop on a 404.

The admin key comes from `.env` as for `/doxa-context`
(`PRODUCTION_ADMIN_API_KEY` for prod). If a later call fails with 401 or 403,
stop and ask for a working key in the same words `/add-language-everywhere`
uses, and never edit `.env` or ask for the key in the conversation.

## 2. Export

```bash
python3 $L --target prod export {code} --out <scratchpad>/libraries-{code}.jsonl
```

One line per English day that lacks the language, with its text segments in
document order. Verse blocks are not in the export. The printed size, about 1,100
days and 230,000 characters for a language with nothing yet, is the work ahead.
Tell the person before you start.

## 3. Translate

Add a `translated` list to every line, the same length as `segments`:

- Ground the terms in the glossary and follow its translation notes.
- Segments split where the formatting changes, so one sentence can span a plain
  and a bold segment. Translate the sentence as a whole, then divide it across
  the same number of segments so the bold part stays the bold part. Keep a
  segment's leading and trailing spaces.
- Do not add, drop or merge segments. The server places them back by position.
- Translate faithfully. This is existing prayer content, not new writing.

Work in batches of about 50 days, a batch per file. Parallel subagents are fine;
give each the glossary and the rules above. Check every line before saving:
`translated` exists, is as long as `segments`, and no segment is left in
English.

## 4. Save

```bash
python3 $L --target prod import {code} --file <scratchpad>/libraries-{code}-translated.jsonl
```

Each day is created from its English document with the translated segments in
place. The server then fetches every verse block from the language's Bible,
without calling a translation model. The summary counts:

- **saved**: done.
- **already there**: the day gained this language since the export.
- **skipped**: the English changed since the export. Export again for those.
- **saved with a verse not in `<edition>`**: a verse block did not come from
  the language's Bible. List them for a person to check in the admin.

The `shared-libraries` task on `/admin/onboarding` counts itself.

## 5. Report

Days saved per library, anything skipped or flagged, and the link
`https://pray.doxa.life/admin/libraries`. Nothing is committed: the work is data
on the server.
