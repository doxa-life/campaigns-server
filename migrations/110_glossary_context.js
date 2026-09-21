import {
  seedEnglishContext,
  stripTranslationParentheticals,
  seedMissingChromeLabels
} from './lib/glossary-seed.js'

class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

/**
 * Headwords that carried, in parentheses, the phrase the term is used in. The
 * phrase now lives in the term's "Context" annotation, under the headword.
 */
const HEADWORDS = {
  'Unengaged (people group)': 'Unengaged',
  'Under-engaged (people group)': 'Under-engaged',
  'Frontier people (group)': 'Frontier people',
  'Engagement / engaged (people group)': 'Engagement / engaged',
  'The five "selfs" (of an indigenous church)': 'The five "selfs"',
  'Apostolic (pioneering) effort': 'Apostolic effort',
  'Broader engagement (components)': 'Broader engagement',
  'Daily prayer (for a people group)': 'Daily prayer',
  'Adopt (an unengaged people group)': 'Adopt'
}

export default class GlossaryContextMigration extends BaseMigration {
  id = 110
  name = 'Move the context hint out of glossary headwords'

  async up(sql) {
    for (const [from, to] of Object.entries(HEADWORDS)) {
      await sql`UPDATE glossary_terms SET term = ${to}, updated_at = NOW() WHERE term = ${from}`
    }
    await seedEnglishContext(sql)

    // Drafts that copied the hint into the wording lose it; the "pioneering"
    // gloss on apostolic effort is meaning the wording keeps, without brackets.
    const headwords = Object.values(HEADWORDS)
    await stripTranslationParentheticals(sql, headwords.filter(term => term !== 'Apostolic effort'))
    await stripTranslationParentheticals(sql, ['Apostolic effort'], { keepWords: true })

    // The annotation's label in each language comes from the reviewed files.
    for (const { code } of await sql`SELECT code FROM glossary_languages`) {
      await seedMissingChromeLabels(sql, code)
    }
  }
}
