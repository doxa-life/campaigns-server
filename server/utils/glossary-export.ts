/**
 * The published shape of a language's glossary.
 *
 * This is what a developer or agent reads before translating a repository's
 * strings, so it carries the annotations and not just the words: "people group"
 * must not become "tribe" or "nation", and that constraint only exists in the
 * prose. Review status travels with each term so provisional wording is
 * recognisable as provisional.
 */

import type { GlossaryEntry, GlossaryLanguage } from '../database/glossary'

export interface GlossaryExportTerm {
  term: string
  section: string
  fields: Array<{ label: string; value: string }>
  translation: string
  status: string
  stale: boolean
  note: string | null
  reviewed_by: string | null
  updated_at: string | null
}

export interface GlossaryExport {
  language: {
    code: string
    name_en: string
    name_local: string
    text_direction: string
    bible_id: string | null
    bible_translation: string | null
  }
  generated_at: string
  term_count: number
  confirmed_count: number
  terms: GlossaryExportTerm[]
}

export function buildGlossaryExport(language: GlossaryLanguage, entries: GlossaryEntry[]): GlossaryExport {
  const terms = entries
    .filter(entry => entry.value.trim())
    .map(entry => ({
      term: entry.term,
      section: entry.section_title,
      fields: entry.fields,
      translation: entry.value,
      status: entry.status,
      stale: entry.stale,
      note: entry.note,
      reviewed_by: entry.updated_by_name,
      updated_at: entry.updated_at
    }))

  return {
    language: {
      code: language.code,
      name_en: language.name_en,
      name_local: language.name_local,
      text_direction: language.text_direction,
      bible_id: language.bible_id,
      bible_translation: language.bible_translation
    },
    generated_at: new Date().toISOString(),
    term_count: terms.length,
    confirmed_count: terms.filter(term => term.status === 'confirmed').length,
    terms
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}

/** The same content as a document, for reading rather than parsing. */
export function renderGlossaryMarkdown(data: GlossaryExport): string {
  const lines: string[] = []
  lines.push(`# ${data.language.name_en} glossary`)
  lines.push('')
  lines.push(`${data.confirmed_count} of ${data.term_count} terms confirmed by a reviewer.`)
  if (data.language.bible_translation) {
    lines.push('')
    lines.push(`Biblical wording follows **${data.language.bible_translation}**.`)
  }
  lines.push('')
  lines.push('| English | ' + data.language.name_en + ' | Status |')
  lines.push('| --- | --- | --- |')
  for (const term of data.terms) {
    const status = term.stale ? `${term.status} (stale)` : term.status
    lines.push(`| ${escapeCell(term.term)} | ${escapeCell(term.translation)} | ${status} |`)
  }

  let section = ''
  for (const term of data.terms) {
    if (term.section !== section) {
      section = term.section
      lines.push('', `## ${section}`)
    }
    lines.push('', `### ${term.term} → ${term.translation}`)
    for (const field of term.fields) {
      lines.push('', `**${field.label}.** ${field.value}`)
    }
    if (term.note) lines.push('', `**Reviewer note.** ${term.note}`)
  }

  lines.push('')
  return lines.join('\n')
}
