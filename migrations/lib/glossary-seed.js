import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Seeding one reviewed glossary language from its file in
 * data/glossary/languages. Migration 101 seeds every file there when the
 * glossary is first created; a language reviewed after that ships through its
 * own migration calling the same function. Files in data/glossary/unreviewed
 * are drafts awaiting a reviewer and are never seeded.
 */

export const LANGUAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'glossary', 'languages')

/**
 * The target-language half of a locale file's reviewer wording. The English
 * half is code-owned in config/glossary-chrome.ts, so only the translated
 * strings are stored.
 */
export function localChrome(locale) {
  const instructions = locale.instructions || {}
  const labels = locale.labels || {}
  const reviewer = locale.reviewer || {}

  const localLabels = {}
  for (const [key, value] of Object.entries(labels)) {
    if (key.endsWith('_local')) localLabels[key.slice(0, -'_local'.length)] = value
  }
  // The review form's Approve action is the page's Confirm action.
  if (localLabels.approve && !localLabels.confirm) localLabels.confirm = localLabels.approve

  const reviewerRows = {}
  for (const row of reviewer.rows || []) {
    if (row.tag && row.local) reviewerRows[row.tag] = row.local
  }

  return {
    instructions: {
      heading: instructions.local_heading || '',
      purpose_label: instructions.local_purpose_label || '',
      purpose: instructions.local_purpose || '',
      items: instructions.local_items || []
    },
    section_titles: locale.section_titles || {},
    field_labels: locale.field_labels || {},
    labels: localLabels,
    reviewer: {
      heading: reviewer.heading_local || '',
      bible_label: reviewer.bible_label_local || '',
      bible_note: reviewer.bible_note_local || '',
      rows: reviewerRows
    }
  }
}

/**
 * Insert the language row and its drafted terms from `{languagesDir}/{code}.json`.
 * A language already in the database is left untouched — its reviewed state is
 * the source of truth — and reported as skipped. A missing file throws so a
 * migration naming a code without a reviewed file fails the deploy.
 */
export async function seedGlossaryLanguage(sql, code, { languagesDir = LANGUAGES_DIR } = {}) {
  const file = join(languagesDir, `${code}.json`)
  if (!existsSync(file)) throw new Error(`No reviewed glossary file for "${code}" at ${file}`)
  const locale = JSON.parse(readFileSync(file, 'utf8'))
  const localeCode = locale.locale_code || code

  const [existing] = await sql`SELECT 1 FROM glossary_languages WHERE code = ${localeCode}`
  if (existing) {
    console.log(`  ℹ️  glossary language ${localeCode} already present, skipping`)
    return { code: localeCode, seeded: 0, skipped: true }
  }

  const termIdByTerm = new Map()
  for (const row of await sql`SELECT id, term FROM glossary_terms`) termIdByTerm.set(row.term, row.id)

  const chrome = localChrome(locale)
  const [language] = await sql`
    INSERT INTO glossary_languages (code, name_en, name_local, text_direction, chrome)
    VALUES (
      ${localeCode},
      ${locale.language_name_en || locale.output_name || localeCode},
      ${locale.language_name_local || ''},
      ${locale.text_direction === 'rtl' ? 'rtl' : 'ltr'},
      ${sql.json(chrome)}::jsonb
    )
    RETURNING id
  `

  // A seeded term is either the bare wording or { value, note, status }:
  // the note carries why the wording was chosen, and a term whose choice is
  // still contested ships flagged so the next reviewer sees the question.
  let seeded = 0
  for (const [term, entry] of Object.entries(locale.suggested_terms || {})) {
    const termId = termIdByTerm.get(term)
    if (!termId) continue
    const { value, note = null, status = 'draft' } = typeof entry === 'string' ? { value: entry } : entry
    await sql`
      INSERT INTO glossary_translations (language_id, term_id, value, status, note)
      VALUES (${language.id}, ${termId}, ${value}, ${status}, ${note})
    `
    seeded++
  }
  console.log(`  ✅ seeded ${localeCode} with ${seeded} drafted terms`)
  return { code: localeCode, seeded, skipped: false }
}

/** Seed several languages in one migration, in the order given. */
export async function seedGlossaryLanguages(sql, codes, options) {
  const results = []
  for (const code of codes) results.push(await seedGlossaryLanguage(sql, code, options))
  return results
}
