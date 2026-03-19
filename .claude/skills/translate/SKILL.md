---
name: translate
description: Propagate i18n locale changes from English to all other languages
user-invocable: true
---

Propagate recent English i18n changes to all other locale files.

## Steps

1. Read the changed keys in the English locale files under `i18n/locales/en/` (use git diff or the conversation context to identify what changed).

2. Get the list of target languages from `config/languages.ts` — use ALL languages (not just enabled), skipping `en`.

3. For each target language, read the corresponding locale file (e.g., `i18n/locales/es/common.json`) and update only the changed keys with translated values.

4. Translation guidelines:
   - Consult the DeepL glossary at `../translation/deepl-glossaries/{code}.tsv` for the target language to ensure consistent terminology
   - Maintain the exact same JSON structure and key paths as the English file
   - Preserve any existing translations for keys that were NOT changed in English
   - For Arabic (`ar`), text direction is RTL — no special JSON handling needed, just translate the string values

5. Locale files per language: `bible.json`, `common.json`, `languages.json`, `people-groups.json`

6. Do NOT add or remove keys that weren't part of the English change. Only translate keys that were modified in English.

7. Show a summary of what was translated: which keys, how many languages.