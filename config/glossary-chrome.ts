/**
 * English wording of the glossary review page.
 *
 * The reviewer sees every label twice — in English and in the language being
 * reviewed — so a native speaker who does not work in English can still tell
 * what is being asked. This half is fixed and lives in code; the translated
 * half is drafted per language and stored on `glossary_languages.chrome`.
 *
 * `{language}` is replaced with the language's English name.
 */

export interface GlossaryChrome {
  instructions: {
    heading: string
    purpose_label: string
    purpose: string
    items: string[]
  }
  labels: Record<string, string>
  reviewer: {
    heading: string
    bible_label: string
    bible_note: string
    rows: Record<string, string>
  }
}

export const GLOSSARY_CHROME_EN: GlossaryChrome = {
  instructions: {
    heading: 'Instructions in English',
    purpose_label: 'Purpose',
    purpose:
      'Please confirm or edit the suggested {language} term for each English glossary entry. The {language} suggestions are starting points, not approved translations.',
    items: [
      'Read the English term, definition or meaning, example, and ‘Why it matters’ note before deciding.',
      'Keep every numeric threshold and distinction exact, including ≤ 2%, ≤ 1%, ≤ 0.1%, the 100+ daily-intercessor goal, and the CPM measures.',
      'Use standard {language} spelling and script. Keep Doxa.Life and DOXA unchanged. Retain UPG, UUPG, and CPM alongside the {language} phrase unless you recommend a stable {language} acronym and explain it in Notes.',
      'For biblical phrases, use the wording of the Bible translation most commonly used by your local church or Assemblies of God/Pentecostal community—not merely your personal preference. Record its exact title, abbreviation, edition, and year below. If local communities commonly use more than one translation, list the primary one first and note the others.',
      'Check that related terms form a coherent family, especially engage / engaged / engagement / unengaged / under-engaged / fruitful engagement.',
      'Choose Confirm if the suggested {language} term is accurate, natural in {language} evangelical and missional usage, and suitable for both prose and interface labels.',
      'Edit the term if you prefer another wording — write the complete preferred term, do not merely describe the change. Flag a term instead if you want it discussed before it is settled.'
    ]
  },
  labels: {
    seed_term: 'SEED TERM',
    suggested_term: 'Suggested {language} term',
    section_note: 'Section note',
    decision: 'Decision',
    confirm: 'Confirm',
    edit: 'Edit',
    flag: 'Flag for discussion',
    final_term: 'Final {language} term',
    translator_notes: 'Translator notes',
    submit: 'I have finished this review',
    submitted: 'Review submitted'
  },
  reviewer: {
    heading: 'Reviewer details',
    bible_label: 'Bible translation',
    bible_note:
      'Please report the translation most regularly used by your local church community, even if your personal preference is different.',
    rows: {
      reviewer_name: 'Your name',
      bible_translation_primary: 'Bible translation used most regularly',
      bible_translation_edition_year: 'Exact abbreviation, edition, and year'
    }
  }
}

/** English glossary field labels, in the order a term's annotations are shown. */
export const GLOSSARY_FIELD_LABELS = [
  'Meaning',
  'Site definition',
  'Example',
  'Why it matters'
]

/** Fill `{language}` placeholders with a language's English name. */
export function fillChrome<T>(value: T, language: string): T {
  if (typeof value === 'string') {
    return value.replace(/\{language\}/g, language) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map(item => fillChrome(item, language)) as unknown as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, fillChrome(item, language)])
    ) as unknown as T
  }
  return value
}
