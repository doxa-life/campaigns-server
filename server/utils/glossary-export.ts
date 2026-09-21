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
  /** The English acronym, for a term known by one. */
  acronym: string | null
  section: string
  fields: Array<{ label: string; value: string }>
  translation: string
  /** The acronym this language uses: its own where a reviewer chose one, otherwise the English one. */
  acronym_translation: string | null
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
  /**
   * The language's rules, as markdown: register, the prayer-prompt verbs,
   * acronym policy, numerals, script and name handling. Empty until a reviewer
   * or an admin writes them.
   */
  notes: string
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
      acronym: entry.acronym,
      section: entry.section_title,
      fields: entry.fields,
      translation: entry.value,
      acronym_translation: entry.acronym ? entry.acronym_translation || entry.acronym : null,
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
    notes: language.notes || '',
    generated_at: new Date().toISOString(),
    term_count: terms.length,
    confirmed_count: terms.filter(term => term.status === 'confirmed').length,
    terms
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}

/** A wording with its acronym after it, as the pair reads in prose. */
export function withAcronym(text: string, acronym: string | null): string {
  return acronym ? `${text} (${acronym})` : text
}

/** The same content as a document, for reading rather than parsing. */
export function renderGlossaryMarkdown(data: GlossaryExport): string {
  const lines: string[] = []
  lines.push(`# ${data.language.name_en} glossary`)
  lines.push('')
  lines.push(`${data.confirmed_count} of ${data.term_count} terms confirmed by a reviewer.`)
  // Both sides below show a term's acronym in parentheses, so a reader has to
  // be told it is a field of its own rather than part of the wording.
  if (data.terms.some(term => term.acronym)) {
    lines.push('')
    lines.push(
      'An acronym in parentheses is a separate field, not part of the wording. Use it only where the text uses the bare acronym, and never append it to the wording.'
    )
  }
  if (data.language.bible_translation) {
    lines.push('')
    lines.push(`Biblical wording follows **${data.language.bible_translation}**.`)
  }
  // Ahead of the terms, because these rules govern how every one of them is
  // used and a reader who stops after the table should still have seen them.
  if (data.notes.trim()) {
    lines.push('')
    lines.push(`## Rules for ${data.language.name_en}`)
    lines.push('')
    lines.push(data.notes.trim())
  }
  lines.push('')
  lines.push('| English | ' + data.language.name_en + ' | Status |')
  lines.push('| --- | --- | --- |')
  for (const term of data.terms) {
    const status = term.stale ? `${term.status} (stale)` : term.status
    lines.push(
      `| ${escapeCell(withAcronym(term.term, term.acronym))} | ${escapeCell(withAcronym(term.translation, term.acronym_translation))} | ${status} |`
    )
  }

  let section = ''
  for (const term of data.terms) {
    if (term.section !== section) {
      section = term.section
      lines.push('', `## ${section}`)
    }
    lines.push('', `### ${withAcronym(term.term, term.acronym)} → ${withAcronym(term.translation, term.acronym_translation)}`)
    for (const field of term.fields) {
      lines.push('', `**${field.label}.** ${field.value}`)
    }
    if (term.note) lines.push('', `**Reviewer note.** ${term.note}`)
  }

  lines.push('')
  return lines.join('\n')
}
