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

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'glossary')

export const LANGUAGES_DIR = join(DATA_DIR, 'languages')
export const ENGLISH_FILE = join(DATA_DIR, 'glossary.en.json')

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
 * A wording that ends in a parenthesised acronym — "unerreichte Volksgruppe
 * (UVG)", "植堂运动（CPM）" — split into the wording and the acronym.
 */
export function splitTrailingAcronym(value) {
  const match = /^(.*?)\s*[（(]\s*([^()（）]{1,12}?)\s*[)）]\s*$/.exec(value || '')
  if (!match) return { value, acronym: null }
  return { value: match[1], acronym: match[2] }
}

/**
 * A wording with its parenthesised groups removed — "tägliches Gebet (für eine
 * Volksgruppe)" becomes "tägliches Gebet". With `keepWords` the parentheses go
 * and the words stay: "esfuerzo apostólico (pionero)" becomes "esfuerzo
 * apostólico pionero", for a gloss that belongs in the wording.
 */
export function stripParentheticals(value, { keepWords = false } = {}) {
  // Full-width parentheses sit in text that takes no spaces between words.
  const stripped = keepWords
    ? (value || '').replace(/（\s*([^()（）]*?)\s*）/g, '$1').replace(/\(\s*([^()（）]*?)\s*\)/g, ' $1 ')
    : (value || '').replace(/\s*[（(][^()（）]*[)）]/g, ' ')
  return stripped.replace(/\s+/g, ' ').replace(/\s+([,;:.])/g, '$1').trim()
}

/**
 * The acronym a language stores for a term: only its own. Empty, or the
 * English acronym spelled the same way, is null — the English one then applies,
 * and a change to it reaches every language that never chose another.
 */
export function ownAcronym(acronym, englishAcronym) {
  const own = (acronym || '').trim()
  if (!own) return null
  if (englishAcronym && own.toUpperCase() === englishAcronym.toUpperCase()) return null
  return own
}

async function columnExists(sql, table, column) {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
  `
  return rows.length > 0
}

function readLanguageFile(code, languagesDir) {
  const file = join(languagesDir, `${code}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * A seeded term is either the bare wording or { value, acronym, note, status }:
 * the acronym is the language's own where it has one, the note carries why the
 * wording was chosen, and a term whose choice is still contested ships flagged
 * so the next reviewer sees the question.
 */
function seedEntry(entry) {
  return typeof entry === 'string' ? { value: entry } : entry
}

/**
 * Insert the language row and its drafted terms from `{languagesDir}/{code}.json`.
 * A language already in the database is left untouched — its reviewed state is
 * the source of truth — and reported as skipped. A missing file throws so a
 * migration naming a code without a reviewed file fails the deploy.
 */
export async function seedGlossaryLanguage(sql, code, { languagesDir = LANGUAGES_DIR } = {}) {
  const locale = readLanguageFile(code, languagesDir)
  if (!locale) throw new Error(`No reviewed glossary file for "${code}" at ${join(languagesDir, `${code}.json`)}`)
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

  let seeded = 0
  for (const [term, entry] of Object.entries(locale.suggested_terms || {})) {
    const termId = termIdByTerm.get(term)
    if (!termId) continue
    const { value, note = null, status = 'draft' } = seedEntry(entry)
    await sql`
      INSERT INTO glossary_translations (language_id, term_id, value, status, note)
      VALUES (${language.id}, ${termId}, ${value}, ${status}, ${note})
    `
    seeded++
  }

  // The acronym column arrives with migration 109, after 101 has seeded the
  // first languages; 109 then fills theirs from the same files.
  if (await columnExists(sql, 'glossary_translations', 'acronym')) {
    await seedTranslationAcronyms(sql, localeCode, { languagesDir })
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

/**
 * Put each English acronym in glossary.en.json on its term. A headword that
 * still carries the acronym in parentheses — the form the glossary used before
 * acronyms had a column — is reduced to the bare term.
 */
export async function seedEnglishAcronyms(sql, { englishFile = ENGLISH_FILE } = {}) {
  const english = JSON.parse(readFileSync(englishFile, 'utf8'))
  let set = 0
  for (const section of english.sections || []) {
    for (const entry of section.entries || []) {
      if (!entry.acronym) continue
      const result = await sql`
        UPDATE glossary_terms
        SET acronym = ${entry.acronym}, term = ${entry.term}
        WHERE term IN (${entry.term}, ${`${entry.term} (${entry.acronym})`})
          AND acronym IS DISTINCT FROM ${entry.acronym}
      `
      set += result.count
    }
  }
  return set
}

/**
 * Move a parenthesised acronym out of stored wordings into the acronym column,
 * for every term that has an English acronym. Revisions get the same treatment
 * so restoring one restores the split form. An acronym already chosen is kept.
 */
export async function splitTranslationAcronyms(sql) {
  let split = 0

  const translations = await sql`
    SELECT tr.id, tr.value, gt.acronym AS english_acronym
    FROM glossary_translations tr
    JOIN glossary_terms gt ON gt.id = tr.term_id
    WHERE gt.acronym IS NOT NULL
  `
  for (const row of translations) {
    const { value, acronym } = splitTrailingAcronym(row.value)
    if (acronym === null) continue
    await sql`
      UPDATE glossary_translations
      SET value = ${value}, acronym = COALESCE(acronym, ${ownAcronym(acronym, row.english_acronym)})
      WHERE id = ${row.id}
    `
    split++
  }

  const revisions = await sql`
    SELECT r.id, r.value, gt.acronym AS english_acronym
    FROM glossary_translation_revisions r
    JOIN glossary_translations tr ON tr.id = r.translation_id
    JOIN glossary_terms gt ON gt.id = tr.term_id
    WHERE gt.acronym IS NOT NULL
  `
  for (const row of revisions) {
    const { value, acronym } = splitTrailingAcronym(row.value)
    if (acronym === null) continue
    await sql`
      UPDATE glossary_translation_revisions
      SET value = ${value}, acronym = COALESCE(acronym, ${ownAcronym(acronym, row.english_acronym)})
      WHERE id = ${row.id}
    `
    split++
  }

  return split
}

/**
 * Set each term's own acronym from `{languagesDir}/{code}.json` where the
 * stored wording is still the file's and no acronym has been chosen. A wording
 * a reviewer has since changed is left alone: the database is the reviewed
 * state. A language with no file is skipped.
 */
export async function seedTranslationAcronyms(sql, code, { languagesDir = LANGUAGES_DIR } = {}) {
  const locale = readLanguageFile(code, languagesDir)
  if (!locale) return 0
  const localeCode = locale.locale_code || code

  let set = 0
  for (const [term, entry] of Object.entries(locale.suggested_terms || {})) {
    const { value, acronym } = seedEntry(entry)
    if (!acronym) continue
    const result = await sql`
      UPDATE glossary_translations tr
      SET acronym = ${acronym}
      FROM glossary_terms gt, glossary_languages gl
      WHERE tr.term_id = gt.id AND tr.language_id = gl.id
        AND gl.code = ${localeCode} AND gt.term = ${term}
        AND tr.acronym IS NULL AND tr.value = ${value}
    `
    set += result.count
  }
  return set
}

/**
 * Put the "Context" annotation from glossary.en.json — the term as it is used,
 * shown under the headword — on each term that lacks one. Idempotent: a term
 * already carrying the annotation is left alone.
 */
export async function seedEnglishContext(sql, { englishFile = ENGLISH_FILE } = {}) {
  const english = JSON.parse(readFileSync(englishFile, 'utf8'))
  let set = 0
  for (const section of english.sections || []) {
    for (const entry of section.entries || []) {
      const context = (entry.fields || []).find(([label]) => label === 'Context')
      if (!context) continue
      const field = { label: 'Context', value: context[1] }
      const result = await sql`
        UPDATE glossary_terms
        SET fields = ${sql.json([field])}::jsonb || fields, updated_at = NOW()
        WHERE term = ${entry.term}
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(fields) AS field WHERE field->>'label' = 'Context'
          )
      `
      set += result.count
    }
  }
  return set
}

/**
 * Remove parenthesised groups from every stored wording and revision of the
 * named terms. With `keepWords` the words stay and only the parentheses go.
 */
export async function stripTranslationParentheticals(sql, terms, { keepWords = false } = {}) {
  let stripped = 0

  const translations = await sql`
    SELECT tr.id, tr.value FROM glossary_translations tr
    JOIN glossary_terms gt ON gt.id = tr.term_id
    WHERE gt.term = ANY(${terms}) AND tr.value ~ '[（(]'
  `
  for (const row of translations) {
    const value = stripParentheticals(row.value, { keepWords })
    if (value === row.value) continue
    await sql`UPDATE glossary_translations SET value = ${value} WHERE id = ${row.id}`
    stripped++
  }

  const revisions = await sql`
    SELECT r.id, r.value FROM glossary_translation_revisions r
    JOIN glossary_translations tr ON tr.id = r.translation_id
    JOIN glossary_terms gt ON gt.id = tr.term_id
    WHERE gt.term = ANY(${terms}) AND r.value ~ '[（(]'
  `
  for (const row of revisions) {
    const value = stripParentheticals(row.value, { keepWords })
    if (value === row.value) continue
    await sql`UPDATE glossary_translation_revisions SET value = ${value} WHERE id = ${row.id}`
    stripped++
  }

  return stripped
}

/**
 * Add any reviewer-page label or field label the language's file carries and
 * its stored chrome lacks. A label already stored wins, whoever wrote it. A
 * language with no file is skipped.
 */
export async function seedMissingChromeLabels(sql, code, { languagesDir = LANGUAGES_DIR } = {}) {
  const locale = readLanguageFile(code, languagesDir)
  if (!locale) return 0

  const [row] = await sql`SELECT id, chrome FROM glossary_languages WHERE code = ${locale.locale_code || code}`
  if (!row) return 0

  const fromFile = localChrome(locale)
  const chrome = { ...(row.chrome || {}) }
  let added = 0
  for (const group of ['labels', 'field_labels']) {
    const stored = chrome[group] || {}
    const missing = Object.fromEntries(
      Object.entries(fromFile[group]).filter(([key]) => !(key in stored))
    )
    if (Object.keys(missing).length === 0) continue
    chrome[group] = { ...stored, ...missing }
    added += Object.keys(missing).length
  }
  if (added === 0) return 0

  await sql`UPDATE glossary_languages SET chrome = ${sql.json(chrome)}::jsonb, updated_at = NOW() WHERE id = ${row.id}`
  return added
}
