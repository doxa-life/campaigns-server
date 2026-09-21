/**
 * AI drafting for the glossary.
 *
 * Adding a language proposes a wording for every English term and translates
 * the reviewer page's own instructions, so a native speaker arrives at a
 * complete form in their language rather than a blank one. Everything produced
 * here is a draft until a person confirms it.
 *
 * The term prompt carries the decisions that repeated review rounds settled —
 * what "people group" may and may not become, which strings stay in English,
 * how the engagement family holds together — because a bare translate call
 * re-litigates them differently every time.
 */

import { GLOSSARY_CHROME_EN, fillChrome, type GlossaryChrome } from '../../config/glossary-chrome'
import { openrouterChat, getTranslationModel, OpenRouterError } from './openrouter'
import type { GlossaryField, GlossaryLanguage } from '../database/glossary'

export interface TermToDraft {
  term: string
  acronym: string | null
  section_title: string
  fields: GlossaryField[]
}

/** A proposed wording; the acronym is the language's own or null for the English one. */
export interface DraftedWording {
  translation: string
  acronym: string | null
}

function termDecisions(language: string, bibleTranslation: string | null): string {
  return `Fixed decisions — apply all of them:
1. "People group" is an ethnolinguistic concept. Never render it as nation-state, country, "tribe" in a sense carrying primitive connotations, or a general social group. An imprecise rendering invalidates every statistic on the site.
2. Reproduce every numeric threshold and distinction exactly: ≤ 2%, ≤ 1%, ≤ 0.1%, the 100+ daily-intercessor goal, and the church-planting-movement measures.
3. Never introduce a 24-hour prayer coverage or 144-intercessor framing. That model is retired; the goal is 100+ daily intercessors.
4. Keep "Doxa.Life" and "DOXA" unchanged.
5. A term given with an acronym keeps that English acronym by default. Return an acronym for it only where ${language} has an established acronym of its own, and never invent one.
6. Do not translate proper nouns or organisation names, including World Assemblies of God Fellowship.
7. Give verbs in the infinitive.
8. Render the five "selfs" of an indigenous church as adjectives, not nouns.
9. Keep the engagement family coherent — engage, engaged, engagement, unengaged, under-engaged, fruitful engagement must share one root so the relationships between them survive.
10. Use natural ${language} evangelical and missiological register. The wording must work both in running prose and as a short interface label.
11. ${bibleTranslation
      ? `For biblical phrases, follow the wording of ${bibleTranslation}.`
      : 'Biblical phrases are provisional: propose the most widely recognised wording, which a local reviewer will align to the Bible translation their community uses.'}
12. Propose the term itself — not a definition, an explanation, or the phrase given as its Context — and add nothing in parentheses. Where the ${language} word cannot stand alone, give the full phrase in plain words.`
}

function termPrompt(language: string, bibleTranslation: string | null, notes: string, count: number): string {
  // A language whose reviewer has already written down its register, acronym
  // policy or numerals should have drafts that obey them from the start.
  const notesBlock = notes.trim()
    ? `\n\nRules already settled for ${language}. They outrank the general decisions above wherever the two disagree:\n${notes.trim()}`
    : ''

  return `You are a missiological terminologist producing a ${language} glossary for a Christian prayer platform. For each English glossary entry you are given the term, its acronym where it has one, its section, and the annotations a human reviewer will judge it against — the site definition or meaning, an example of real usage, and why the term matters.

${termDecisions(language, bibleTranslation)}${notesBlock}

Return a JSON object of the form {"terms": [{"term": "<the English term, copied exactly>", "translation": "<the ${language} term, without any acronym>", "acronym": "<the established ${language} acronym, only for a term given with one and only where it differs from the English>"}]} with exactly ${count} entries, one per English term, in the order given. Omit "acronym" otherwise. Add no commentary.`
}

interface DraftedTerm {
  term: string
  translation: string
  acronym?: string
}

function parseDraftedTerms(content: string, expected: TermToDraft[]): Map<string, DraftedWording> {
  const raw = content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw)
  const rows: DraftedTerm[] = parsed?.terms

  if (!Array.isArray(rows) || rows.length !== expected.length) {
    throw new Error(`Expected ${expected.length} drafted terms, got ${Array.isArray(rows) ? rows.length : 'invalid output'}`)
  }

  const drafted = new Map<string, DraftedWording>()
  rows.forEach((row, index) => {
    const englishTerm = expected[index]!.term
    if (typeof row?.translation !== 'string' || !row.translation.trim()) {
      throw new Error(`No translation returned for "${englishTerm}"`)
    }
    const acronym = typeof row.acronym === 'string' ? row.acronym.trim() : ''
    drafted.set(englishTerm, { translation: row.translation.trim(), acronym: acronym || null })
  })
  return drafted
}

/**
 * Propose a wording for every term in one request. Returns English term →
 * proposed wording; a term the model skipped is absent rather than blank.
 */
export async function draftGlossaryTerms(
  language: Pick<GlossaryLanguage, 'name_en' | 'bible_translation' | 'notes'>,
  terms: TermToDraft[]
): Promise<Map<string, DraftedWording>> {
  if (terms.length === 0) return new Map()

  const model = await getTranslationModel()
  const payload = {
    terms: terms.map(term => ({
      term: term.term,
      ...(term.acronym ? { acronym: term.acronym } : {}),
      section: term.section_title,
      context: Object.fromEntries(term.fields.map(field => [field.label, field.value]))
    }))
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: termPrompt(language.name_en, language.bible_translation, language.notes || '', terms.length) },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    response_format: { type: 'json_object' }
  }

  console.log(`[Glossary] ${model}: drafting ${terms.length} terms → ${language.name_en}`)

  let lastError: Error | undefined
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { status, data } = await openrouterChat(body, 'Glossary')
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new OpenRouterError('OpenRouter returned no glossary draft', status, true)
    }
    try {
      return parseDraftedTerms(content, terms)
    } catch (e: any) {
      lastError = e
      console.warn(`[Glossary] attempt ${attempt} failed for ${language.name_en}: ${e?.message}`)
    }
  }

  throw new OpenRouterError(`Drafting the ${language.name_en} glossary failed: ${lastError?.message}`, null, true)
}

/** Ordered [path, text] pairs of every translatable string in the page chrome. */
function flattenChrome(value: unknown, path: string[] = [], out: Array<[string[], string]> = []): Array<[string[], string]> {
  if (typeof value === 'string') {
    out.push([path, value])
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flattenChrome(item, [...path, String(index)], out))
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      flattenChrome(item, [...path, key], out)
    }
  }
  return out
}

function setAtPath(target: any, path: string[], value: string): void {
  let node = target
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    const nextKey = path[i + 1]!
    if (node[key] === undefined) node[key] = /^\d+$/.test(nextKey) ? [] : {}
    node = node[key]
  }
  node[path[path.length - 1]!] = value
}

/**
 * Translate the reviewer page's instructions, labels and section titles into a
 * language. Section titles are keyed by their English title so a renamed
 * section falls back to English rather than showing the wrong heading.
 */
export async function draftGlossaryChrome(
  language: Pick<GlossaryLanguage, 'name_en'>,
  sectionTitles: string[],
  fieldLabels: string[]
): Promise<Record<string, any>> {
  const english = fillChrome(GLOSSARY_CHROME_EN, language.name_en) as GlossaryChrome
  const source = {
    instructions: english.instructions,
    labels: english.labels,
    reviewer: english.reviewer,
    notes: english.notes,
    section_titles: Object.fromEntries(sectionTitles.map(title => [title, title])),
    field_labels: Object.fromEntries(fieldLabels.map(label => [label, label]))
  }

  const entries = flattenChrome(source)
  const model = await getTranslationModel()

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: `You are translating the interface of a terminology review form into ${language.name_en}. The reviewer is a native ${language.name_en} speaker with a missions or theological background.

- Keep "Doxa.Life", "DOXA", "UPG", "UUPG" and "CPM" unchanged.
- Keep every numeric threshold exact.
- Use the formal register of printed instructions.
- Preserve the meaning of each string precisely; these are instructions a reviewer will follow.

Return a JSON object of the form {"translations": ["...", "..."]} with exactly ${entries.length} strings, in the same order, and no commentary.`
      },
      { role: 'user', content: JSON.stringify({ fragments: entries.map(([, text]) => text) }) }
    ],
    response_format: { type: 'json_object' }
  }

  console.log(`[Glossary] ${model}: drafting review page chrome → ${language.name_en}`)

  const { status, data } = await openrouterChat(body, 'Glossary')
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new OpenRouterError('OpenRouter returned no chrome translation', status, true)
  }

  const raw = content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const translations = JSON.parse(raw)?.translations
  if (!Array.isArray(translations) || translations.length !== entries.length) {
    throw new OpenRouterError(
      `Expected ${entries.length} translated interface strings, got ${Array.isArray(translations) ? translations.length : 'invalid output'}`,
      status,
      true
    )
  }

  const chrome: Record<string, any> = {}
  entries.forEach(([path], index) => {
    const translated = translations[index]
    if (typeof translated === 'string' && translated.trim()) setAtPath(chrome, path, translated.trim())
  })
  return chrome
}
