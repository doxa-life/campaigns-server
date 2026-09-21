/**
 * Glossary data access.
 *
 * The English glossary is authoritative and lives in `glossary_sections` /
 * `glossary_terms`. Each language carries one approved wording per term plus
 * the reviewer-page chrome in that language. Reviewers edit translations live
 * through a magic link, so every write appends a revision — that record is what
 * makes an unauthenticated edit safe to accept.
 *
 * An acronym is a field of its own: the English one on the term, a language's
 * own on its translation. A translation with no acronym of its own uses the
 * English one, so the column holds only a language's explicit choice.
 */

import { randomBytes } from 'crypto'
import { getSql } from './db'

export interface GlossaryField {
  label: string
  value: string
}

export interface GlossaryTerm {
  id: string
  section_id: string
  term: string
  acronym: string | null
  seed: boolean
  fields: GlossaryField[]
  position: number
}

export interface GlossarySection {
  id: string
  title: string
  intro: string
  position: number
}

export interface GlossarySectionWithTerms extends GlossarySection {
  terms: GlossaryTerm[]
}

export type TranslationStatus = 'draft' | 'confirmed' | 'flagged'

export interface GlossaryLanguage {
  id: string
  code: string
  name_en: string
  name_local: string
  text_direction: 'ltr' | 'rtl'
  chrome: Record<string, any>
  bible_id: string | null
  bible_translation: string | null
  bible_translation_note: string | null
  /**
   * Rules that hold for the whole language rather than for one term: register
   * and form of address, the verb pair prayer prompts use, acronym policy,
   * number and date conventions, script and name handling. Markdown, written in
   * English or in the language itself, and injected verbatim into every
   * translation prompt.
   */
  notes: string
  created_at: string
  updated_at: string
}

export interface GlossaryLanguageSummary extends GlossaryLanguage {
  term_count: number
  confirmed_count: number
  flagged_count: number
  stale_count: number
  open_pass_count: number
}

export interface GlossaryTranslation {
  id: string
  language_id: string
  term_id: string
  value: string
  acronym: string | null
  status: TranslationStatus
  note: string | null
  stale: boolean
  updated_by_name: string | null
  updated_by_pass_id: string | null
  updated_at: string
}

export interface GlossaryReviewPass {
  id: string
  language_id: string
  label: string
  token: string
  reviewer_name: string | null
  reviewer_email: string | null
  status: 'open' | 'submitted'
  submitted_at: string | null
  last_seen_at: string | null
  created_at: string
}

export interface GlossaryRevision {
  id: string
  translation_id: string
  value: string
  acronym: string | null
  status: TranslationStatus
  note: string | null
  reviewer_name: string | null
  pass_id: string | null
  source: string
  created_at: string
}

/** One saved state of a language's translation notes. */
export interface GlossaryNoteRevision {
  id: string
  language_id: string
  notes: string
  reviewer_name: string | null
  pass_id: string | null
  source: string
  created_at: string
}

/** Who made a change, for the revision trail. */
export interface GlossaryActor {
  name?: string | null
  passId?: string | null
  /** 'review' for a magic-link edit, 'admin', 'ai' for a generated draft, 'revert'. */
  source: 'review' | 'admin' | 'ai' | 'revert'
}

/**
 * postgres.js types `sql.json` for object-shaped values, and a term's
 * annotations are an array. Interpolating a JSON string instead would store a
 * jsonb string rather than the array, so the cast stays and the encoding does
 * not change.
 */
function jsonValue(sql: ReturnType<typeof getSql>, value: unknown) {
  return sql.json(value as any)
}

/**
 * The acronym a language stores for a term: only its own. Empty, or the
 * English acronym spelled the same way, is null so the English one applies.
 */
function ownAcronym(acronym: string | null | undefined, englishAcronym: string | null | undefined): string | null {
  const own = (acronym || '').trim()
  if (!own) return null
  if (englishAcronym && own.toUpperCase() === englishAcronym.toUpperCase()) return null
  return own
}

const SECTION_COLUMNS = 'id, title, intro, position'
const TERM_COLUMNS = 'id, section_id, term, acronym, seed, fields, position'
const LANGUAGE_COLUMNS =
  'id, code, name_en, name_local, text_direction, chrome, bible_id, bible_translation, bible_translation_note, notes, created_at, updated_at'
const TRANSLATION_COLUMNS =
  'id, language_id, term_id, value, acronym, status, note, stale, updated_by_name, updated_by_pass_id, updated_at'
const PASS_COLUMNS =
  'id, language_id, label, token, reviewer_name, reviewer_email, status, submitted_at, last_seen_at, created_at'

// ---------------------------------------------------------------- English glossary

export async function listSections(): Promise<GlossarySection[]> {
  const sql = getSql()
  return (await sql`
    SELECT ${sql.unsafe(SECTION_COLUMNS)} FROM glossary_sections ORDER BY position, title
  `) as unknown as GlossarySection[]
}

export async function listTerms(): Promise<GlossaryTerm[]> {
  const sql = getSql()
  return (await sql`
    SELECT ${sql.unsafe(TERM_COLUMNS)} FROM glossary_terms ORDER BY position, term
  `) as unknown as GlossaryTerm[]
}

/** The English glossary as ordered sections, each with its ordered terms. */
export async function getEnglishGlossary(): Promise<GlossarySectionWithTerms[]> {
  const [sections, terms] = await Promise.all([listSections(), listTerms()])
  return sections.map(section => ({
    ...section,
    terms: terms.filter(term => term.section_id === section.id)
  }))
}

export async function createSection(input: { title: string; intro?: string }): Promise<GlossarySection> {
  const sql = getSql()
  const [row] = await sql`
    INSERT INTO glossary_sections (title, intro, position)
    VALUES (
      ${input.title},
      ${input.intro || ''},
      COALESCE((SELECT MAX(position) + 1 FROM glossary_sections), 0)
    )
    RETURNING ${sql.unsafe(SECTION_COLUMNS)}
  `
  return row as GlossarySection
}

export async function updateSection(
  id: string,
  input: { title?: string; intro?: string; position?: number }
): Promise<GlossarySection | null> {
  const sql = getSql()
  const [row] = await sql`
    UPDATE glossary_sections SET
      title = COALESCE(${input.title ?? null}, title),
      intro = COALESCE(${input.intro ?? null}, intro),
      position = COALESCE(${input.position ?? null}, position),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING ${sql.unsafe(SECTION_COLUMNS)}
  `
  return (row as GlossarySection) || null
}

export async function deleteSection(id: string): Promise<boolean> {
  const sql = getSql()
  const result = await sql`DELETE FROM glossary_sections WHERE id = ${id}`
  return result.count > 0
}

export async function createTerm(input: {
  section_id: string
  term: string
  acronym?: string | null
  fields?: GlossaryField[]
  seed?: boolean
}): Promise<GlossaryTerm> {
  const sql = getSql()
  const [row] = await sql`
    INSERT INTO glossary_terms (section_id, term, acronym, seed, fields, position)
    VALUES (
      ${input.section_id},
      ${input.term},
      ${input.acronym ?? null},
      ${input.seed ?? false},
      ${jsonValue(sql, input.fields || [])}::jsonb,
      COALESCE((SELECT MAX(position) + 1 FROM glossary_terms WHERE section_id = ${input.section_id}), 0)
    )
    RETURNING ${sql.unsafe(TERM_COLUMNS)}
  `
  return row as GlossaryTerm
}

/**
 * Update an English term. Changing the headword, its acronym or its annotations
 * invalidates every review of it, so confirmed translations of that term drop
 * back to draft and are marked stale.
 */
export async function updateTerm(
  id: string,
  input: {
    term?: string
    acronym?: string | null
    fields?: GlossaryField[]
    section_id?: string
    position?: number
    seed?: boolean
  }
): Promise<GlossaryTerm | null> {
  const sql = getSql()
  const [row] = await sql`
    UPDATE glossary_terms SET
      term = COALESCE(${input.term ?? null}, term),
      acronym = ${input.acronym === undefined ? sql`acronym` : input.acronym},
      fields = COALESCE(${input.fields ? jsonValue(sql, input.fields) : null}::jsonb, fields),
      section_id = COALESCE(${input.section_id ?? null}, section_id),
      position = COALESCE(${input.position ?? null}, position),
      seed = COALESCE(${input.seed ?? null}, seed),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING ${sql.unsafe(TERM_COLUMNS)}
  `
  if (!row) return null

  const meaningChanged = input.term !== undefined || input.acronym !== undefined || input.fields !== undefined
  if (meaningChanged) {
    await sql`
      UPDATE glossary_translations
      SET stale = TRUE, status = 'draft', updated_at = NOW()
      WHERE term_id = ${id} AND status = 'confirmed'
    `
  }
  return row as GlossaryTerm
}

export async function deleteTerm(id: string): Promise<boolean> {
  const sql = getSql()
  const result = await sql`DELETE FROM glossary_terms WHERE id = ${id}`
  return result.count > 0
}

// ---------------------------------------------------------------- Languages

export async function listLanguages(): Promise<GlossaryLanguageSummary[]> {
  const sql = getSql()
  return (await sql`
    SELECT
      l.id, l.code, l.name_en, l.name_local, l.text_direction, l.chrome,
      l.bible_id, l.bible_translation, l.bible_translation_note, l.notes,
      l.created_at, l.updated_at,
      (SELECT COUNT(*)::int FROM glossary_terms) AS term_count,
      COUNT(*) FILTER (WHERE t.status = 'confirmed')::int AS confirmed_count,
      COUNT(*) FILTER (WHERE t.status = 'flagged')::int AS flagged_count,
      COUNT(*) FILTER (WHERE t.stale)::int AS stale_count,
      (SELECT COUNT(*)::int FROM glossary_review_passes p
        WHERE p.language_id = l.id AND p.status = 'open') AS open_pass_count
    FROM glossary_languages l
    LEFT JOIN glossary_translations t ON t.language_id = l.id
    GROUP BY l.id
    ORDER BY l.name_en
  `) as unknown as GlossaryLanguageSummary[]
}

export async function getLanguageByCode(code: string): Promise<GlossaryLanguage | null> {
  const sql = getSql()
  const [row] = await sql`
    SELECT ${sql.unsafe(LANGUAGE_COLUMNS)} FROM glossary_languages WHERE code = ${code}
  `
  return (row as GlossaryLanguage) || null
}

export async function getLanguageById(id: string): Promise<GlossaryLanguage | null> {
  const sql = getSql()
  const [row] = await sql`
    SELECT ${sql.unsafe(LANGUAGE_COLUMNS)} FROM glossary_languages WHERE id = ${id}
  `
  return (row as GlossaryLanguage) || null
}

export async function createLanguage(input: {
  code: string
  name_en: string
  name_local?: string
  text_direction?: 'ltr' | 'rtl'
}): Promise<GlossaryLanguage> {
  const sql = getSql()
  const [row] = await sql`
    INSERT INTO glossary_languages (code, name_en, name_local, text_direction)
    VALUES (
      ${input.code},
      ${input.name_en},
      ${input.name_local || ''},
      ${input.text_direction || 'ltr'}
    )
    RETURNING ${sql.unsafe(LANGUAGE_COLUMNS)}
  `
  return row as GlossaryLanguage
}

export async function updateLanguage(
  id: string,
  input: {
    name_en?: string
    name_local?: string
    text_direction?: 'ltr' | 'rtl'
    chrome?: Record<string, any>
    bible_id?: string | null
    bible_translation?: string | null
    bible_translation_note?: string | null
  }
): Promise<GlossaryLanguage | null> {
  const sql = getSql()
  const [row] = await sql`
    UPDATE glossary_languages SET
      name_en = COALESCE(${input.name_en ?? null}, name_en),
      name_local = COALESCE(${input.name_local ?? null}, name_local),
      text_direction = COALESCE(${input.text_direction ?? null}, text_direction),
      chrome = COALESCE(${input.chrome ? jsonValue(sql, input.chrome) : null}::jsonb, chrome),
      bible_id = ${input.bible_id === undefined ? sql`bible_id` : input.bible_id},
      bible_translation = ${input.bible_translation === undefined ? sql`bible_translation` : input.bible_translation},
      bible_translation_note = ${input.bible_translation_note === undefined ? sql`bible_translation_note` : input.bible_translation_note},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING ${sql.unsafe(LANGUAGE_COLUMNS)}
  `
  return (row as GlossaryLanguage) || null
}

export async function deleteLanguage(id: string): Promise<boolean> {
  const sql = getSql()
  const result = await sql`DELETE FROM glossary_languages WHERE id = ${id}`
  return result.count > 0
}

// ---------------------------------------------------------------- Language notes

/**
 * Replace a language's translation notes and append a revision. Notes are
 * written here rather than through `updateLanguage` so that no path can change
 * them without leaving a restorable record — the magic link is unauthenticated.
 */
export async function writeLanguageNotes(
  languageId: string,
  notes: string,
  actor: GlossaryActor
): Promise<GlossaryLanguage | null> {
  const sql = getSql()

  const [row] = await sql`
    UPDATE glossary_languages
    SET notes = ${notes}, updated_at = NOW()
    WHERE id = ${languageId}
    RETURNING ${sql.unsafe(LANGUAGE_COLUMNS)}
  `
  if (!row) return null

  await sql`
    INSERT INTO glossary_language_note_revisions (language_id, notes, reviewer_name, pass_id, source)
    VALUES (${languageId}, ${notes}, ${actor.name ?? null}, ${actor.passId ?? null}, ${actor.source})
  `
  return row as GlossaryLanguage
}

export async function listLanguageNoteRevisions(languageId: string): Promise<GlossaryNoteRevision[]> {
  const sql = getSql()
  return (await sql`
    SELECT id, language_id, notes, reviewer_name, pass_id, source, created_at
    FROM glossary_language_note_revisions
    WHERE language_id = ${languageId}
    ORDER BY created_at DESC
  `) as unknown as GlossaryNoteRevision[]
}

/** Restore an earlier set of notes by writing it as a new change. */
export async function revertLanguageNotes(
  revisionId: string,
  actorName: string | null
): Promise<GlossaryLanguage | null> {
  const sql = getSql()
  const [revision] = await sql`
    SELECT language_id, notes FROM glossary_language_note_revisions WHERE id = ${revisionId}
  `
  if (!revision) return null

  return await writeLanguageNotes(revision.language_id, revision.notes, {
    name: actorName,
    source: 'revert'
  })
}

// ---------------------------------------------------------------- Translations

export interface GlossaryEntry {
  term_id: string
  term: string
  /** The English acronym, for a term known by one. */
  acronym: string | null
  seed: boolean
  section_title: string
  fields: GlossaryField[]
  value: string
  /** The language's own acronym; null where the English one applies. */
  acronym_translation: string | null
  status: TranslationStatus
  note: string | null
  stale: boolean
  updated_by_name: string | null
  updated_at: string | null
  translation_id: string | null
}

/**
 * Every English term paired with this language's wording for it. Terms with no
 * translation row yet come back with an empty value, so a language added after
 * a term was created still lists the full glossary.
 */
export async function getLanguageEntries(languageId: string): Promise<GlossaryEntry[]> {
  const sql = getSql()
  return (await sql`
    SELECT
      gt.id AS term_id,
      gt.term,
      gt.acronym,
      gt.seed,
      gs.title AS section_title,
      gt.fields,
      COALESCE(tr.value, '') AS value,
      tr.acronym AS acronym_translation,
      COALESCE(tr.status, 'draft') AS status,
      tr.note,
      COALESCE(tr.stale, FALSE) AS stale,
      tr.updated_by_name,
      tr.updated_at,
      tr.id AS translation_id
    FROM glossary_terms gt
    JOIN glossary_sections gs ON gs.id = gt.section_id
    LEFT JOIN glossary_translations tr
      ON tr.term_id = gt.id AND tr.language_id = ${languageId}
    ORDER BY gs.position, gs.title, gt.position, gt.term
  `) as unknown as GlossaryEntry[]
}

/**
 * Write one term's wording for a language and append a revision. Passing only
 * a status (Confirm) keeps the existing value; any change to the value or the
 * acronym clears the stale mark, since the wording has now been reconsidered.
 */
export async function writeTranslation(
  languageId: string,
  termId: string,
  patch: { value?: string; acronym?: string | null; status?: TranslationStatus; note?: string | null },
  actor: GlossaryActor
): Promise<GlossaryTranslation> {
  const sql = getSql()

  const [existing] = await sql`
    SELECT ${sql.unsafe(TRANSLATION_COLUMNS)} FROM glossary_translations
    WHERE language_id = ${languageId} AND term_id = ${termId}
  `
  const current = (existing as GlossaryTranslation) || null
  const [term] = await sql`SELECT acronym FROM glossary_terms WHERE id = ${termId}`

  const value = patch.value !== undefined ? patch.value : current?.value ?? ''
  const acronym = patch.acronym !== undefined ? ownAcronym(patch.acronym, term?.acronym) : current?.acronym ?? null
  const status = patch.status !== undefined ? patch.status : current?.status ?? 'draft'
  const note = patch.note !== undefined ? patch.note : current?.note ?? null
  const valueChanged = patch.value !== undefined && patch.value !== current?.value
  const acronymChanged = patch.acronym !== undefined && acronym !== (current?.acronym ?? null)
  const stale = valueChanged || acronymChanged ? false : current?.stale ?? false

  const [row] = await sql`
    INSERT INTO glossary_translations
      (language_id, term_id, value, acronym, status, note, stale, updated_by_name, updated_by_pass_id, updated_at)
    VALUES (
      ${languageId}, ${termId}, ${value}, ${acronym}, ${status}, ${note}, ${stale},
      ${actor.name ?? null}, ${actor.passId ?? null}, NOW()
    )
    ON CONFLICT (language_id, term_id) DO UPDATE SET
      value = EXCLUDED.value,
      acronym = EXCLUDED.acronym,
      status = EXCLUDED.status,
      note = EXCLUDED.note,
      stale = EXCLUDED.stale,
      updated_by_name = EXCLUDED.updated_by_name,
      updated_by_pass_id = EXCLUDED.updated_by_pass_id,
      updated_at = NOW()
    RETURNING ${sql.unsafe(TRANSLATION_COLUMNS)}
  `
  const translation = row as GlossaryTranslation

  await sql`
    INSERT INTO glossary_translation_revisions
      (translation_id, value, acronym, status, note, reviewer_name, pass_id, source)
    VALUES (
      ${translation.id}, ${value}, ${acronym}, ${status}, ${note},
      ${actor.name ?? null}, ${actor.passId ?? null}, ${actor.source}
    )
  `
  return translation
}

export async function listRevisions(translationId: string): Promise<GlossaryRevision[]> {
  const sql = getSql()
  return (await sql`
    SELECT id, translation_id, value, acronym, status, note, reviewer_name, pass_id, source, created_at
    FROM glossary_translation_revisions
    WHERE translation_id = ${translationId}
    ORDER BY created_at DESC
  `) as unknown as GlossaryRevision[]
}

/** Restore a prior wording by writing it as a new change. */
export async function revertToRevision(
  revisionId: string,
  actorName: string | null
): Promise<GlossaryTranslation | null> {
  const sql = getSql()
  const [revision] = await sql`
    SELECT r.value, r.acronym, r.status, r.note, t.language_id, t.term_id
    FROM glossary_translation_revisions r
    JOIN glossary_translations t ON t.id = r.translation_id
    WHERE r.id = ${revisionId}
  `
  if (!revision) return null

  return await writeTranslation(
    revision.language_id,
    revision.term_id,
    { value: revision.value, acronym: revision.acronym, status: revision.status, note: revision.note },
    { name: actorName, source: 'revert' }
  )
}

// ---------------------------------------------------------------- Review passes

function generatePassToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function listPasses(languageId: string): Promise<GlossaryReviewPass[]> {
  const sql = getSql()
  return (await sql`
    SELECT ${sql.unsafe(PASS_COLUMNS)} FROM glossary_review_passes
    WHERE language_id = ${languageId}
    ORDER BY created_at DESC
  `) as unknown as GlossaryReviewPass[]
}

export async function createPass(languageId: string, label: string): Promise<GlossaryReviewPass> {
  const sql = getSql()
  const [row] = await sql`
    INSERT INTO glossary_review_passes (language_id, label, token)
    VALUES (${languageId}, ${label}, ${generatePassToken()})
    RETURNING ${sql.unsafe(PASS_COLUMNS)}
  `
  return row as GlossaryReviewPass
}

/** Issue a new token, which immediately invalidates the link already sent out. */
export async function regeneratePassToken(id: string): Promise<GlossaryReviewPass | null> {
  const sql = getSql()
  const [row] = await sql`
    UPDATE glossary_review_passes SET token = ${generatePassToken()}
    WHERE id = ${id}
    RETURNING ${sql.unsafe(PASS_COLUMNS)}
  `
  return (row as GlossaryReviewPass) || null
}

export async function deletePass(id: string): Promise<boolean> {
  const sql = getSql()
  const result = await sql`DELETE FROM glossary_review_passes WHERE id = ${id}`
  return result.count > 0
}

export async function getPassByToken(token: string): Promise<GlossaryReviewPass | null> {
  const sql = getSql()
  const [row] = await sql`
    SELECT ${sql.unsafe(PASS_COLUMNS)} FROM glossary_review_passes WHERE token = ${token}
  `
  return (row as GlossaryReviewPass) || null
}

/** Record who is working a pass. An omitted email leaves the stored one alone. */
export async function setPassReviewer(
  id: string,
  reviewer: { name: string; email?: string | null }
): Promise<GlossaryReviewPass | null> {
  const sql = getSql()
  const [row] = await sql`
    UPDATE glossary_review_passes SET
      reviewer_name = ${reviewer.name},
      reviewer_email = ${reviewer.email === undefined ? sql`reviewer_email` : reviewer.email},
      last_seen_at = NOW()
    WHERE id = ${id}
    RETURNING ${sql.unsafe(PASS_COLUMNS)}
  `
  return (row as GlossaryReviewPass) || null
}

export async function touchPass(id: string): Promise<void> {
  const sql = getSql()
  await sql`UPDATE glossary_review_passes SET last_seen_at = NOW() WHERE id = ${id}`
}

/**
 * Mark a pass finished. Edits already went in live, so this records that the
 * reviewer considers the round complete; the link keeps working so they can
 * come back to something they remembered later.
 */
export async function submitPass(id: string): Promise<GlossaryReviewPass | null> {
  const sql = getSql()
  const [row] = await sql`
    UPDATE glossary_review_passes
    SET status = 'submitted', submitted_at = NOW(), last_seen_at = NOW()
    WHERE id = ${id}
    RETURNING ${sql.unsafe(PASS_COLUMNS)}
  `
  return (row as GlossaryReviewPass) || null
}

export async function reopenPass(id: string): Promise<GlossaryReviewPass | null> {
  const sql = getSql()
  const [row] = await sql`
    UPDATE glossary_review_passes SET status = 'open', submitted_at = NULL
    WHERE id = ${id}
    RETURNING ${sql.unsafe(PASS_COLUMNS)}
  `
  return (row as GlossaryReviewPass) || null
}

// ---------------------------------------------------------------- Consumers

export interface GlossaryPair {
  term: string
  value: string
  confirmed: boolean
}

/**
 * English → target wording for one language, used to steer machine translation.
 * A term with an acronym also yields the acronym as its own pair, so a bare
 * "UUPG" in source text maps to the language's acronym or stays as it is.
 * Unconfirmed drafts are included: a term applied consistently is cheap to
 * correct once a reviewer rules on it, while a term with no glossary entry
 * drifts differently in every file.
 */
export async function getGlossaryPairs(code: string): Promise<GlossaryPair[]> {
  const sql = getSql()
  const rows = (await sql`
    SELECT
      gt.term, tr.value, gt.acronym,
      COALESCE(tr.acronym, gt.acronym) AS acronym_translation,
      (tr.status = 'confirmed') AS confirmed
    FROM glossary_translations tr
    JOIN glossary_languages gl ON gl.id = tr.language_id
    JOIN glossary_terms gt ON gt.id = tr.term_id
    JOIN glossary_sections gs ON gs.id = gt.section_id
    WHERE gl.code = ${code} AND tr.value <> ''
    ORDER BY gs.position, gt.position
  `) as unknown as Array<GlossaryPair & { acronym: string | null; acronym_translation: string | null }>

  return rows.flatMap(({ term, value, confirmed, acronym, acronym_translation }) => {
    const pairs: GlossaryPair[] = [{ term, value, confirmed }]
    if (acronym) pairs.push({ term: acronym, value: acronym_translation || acronym, confirmed })
    return pairs
  })
}

/** Everything a translation request needs from the glossary for one language. */
export interface GlossaryContext {
  pairs: GlossaryPair[]
  notes: string
}

/**
 * The term list plus the language-wide rules. The two travel together because
 * a prompt needs both: the pairs fix individual words, the notes fix register,
 * acronyms, numerals and the other decisions no single term carries.
 */
export async function getGlossaryContext(code: string): Promise<GlossaryContext> {
  const sql = getSql()
  const [pairs, [language]] = await Promise.all([
    getGlossaryPairs(code),
    sql`SELECT notes FROM glossary_languages WHERE code = ${code}`
  ])
  return { pairs, notes: (language?.notes as string) || '' }
}
