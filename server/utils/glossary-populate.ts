/**
 * Filling a language's glossary from AI drafts.
 *
 * Drafting only ever writes terms that have no wording yet, unless the caller
 * asks to redraft everything — a reviewer's decision is never overwritten by a
 * later populate run.
 */

import {
  getLanguageEntries,
  writeTranslation,
  updateLanguage,
  listSections,
  type GlossaryLanguage
} from '../database/glossary'
import { draftGlossaryTerms, draftGlossaryChrome, type TermToDraft } from './glossary-ai'
import { clearGlossaryCache } from './openrouter'
import { GLOSSARY_FIELD_LABELS } from '../../config/glossary-chrome'

export interface PopulateResult {
  drafted: number
  skipped: number
}

export async function populateLanguageTerms(
  language: GlossaryLanguage,
  options: { redraftAll?: boolean } = {}
): Promise<PopulateResult> {
  const entries = await getLanguageEntries(language.id)
  const pending = options.redraftAll
    ? entries.filter(entry => entry.status !== 'confirmed')
    : entries.filter(entry => !entry.value.trim())

  if (pending.length === 0) return { drafted: 0, skipped: entries.length }

  const toDraft: TermToDraft[] = pending.map(entry => ({
    term: entry.term,
    section_title: entry.section_title,
    fields: entry.fields
  }))

  const drafted = await draftGlossaryTerms(language, toDraft)

  let written = 0
  for (const entry of pending) {
    const value = drafted.get(entry.term)
    if (!value) continue
    await writeTranslation(
      language.id,
      entry.term_id,
      { value, status: 'draft' },
      { name: 'AI draft', source: 'ai' }
    )
    written++
  }

  clearGlossaryCache(language.code)
  return { drafted: written, skipped: entries.length - written }
}

/** Translate the reviewer page's own wording into the language. */
export async function populateLanguageChrome(language: GlossaryLanguage): Promise<void> {
  const sections = await listSections()
  const chrome = await draftGlossaryChrome(
    language,
    sections.map(section => section.title),
    GLOSSARY_FIELD_LABELS
  )
  await updateLanguage(language.id, { chrome })
}
