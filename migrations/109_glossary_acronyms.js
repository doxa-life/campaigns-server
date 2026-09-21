import {
  seedEnglishAcronyms,
  splitTranslationAcronyms,
  seedTranslationAcronyms,
  seedMissingChromeLabels
} from './lib/glossary-seed.js'

class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class GlossaryAcronymsMigration extends BaseMigration {
  id = 109
  name = 'Give glossary acronyms their own column'

  async up(sql) {
    // An acronym is a field of its own rather than part of the headword: the
    // English one on the term, a language's own on its translation. A
    // translation with no acronym of its own uses the English one, so the
    // column holds only a language's explicit choice. Revisions carry it so a
    // restored wording brings its acronym back with it.
    await this.exec(sql, `ALTER TABLE glossary_terms ADD COLUMN IF NOT EXISTS acronym TEXT`)
    await this.exec(sql, `ALTER TABLE glossary_translations ADD COLUMN IF NOT EXISTS acronym TEXT`)
    await this.exec(sql, `ALTER TABLE glossary_translation_revisions ADD COLUMN IF NOT EXISTS acronym TEXT`)

    await seedEnglishAcronyms(sql)
    await splitTranslationAcronyms(sql)

    // Languages seeded by migration 101 predate the column: their acronyms and
    // the field's label on the review page come from the same reviewed files.
    for (const { code } of await sql`SELECT code FROM glossary_languages`) {
      await seedTranslationAcronyms(sql, code)
      await seedMissingChromeLabels(sql, code)
    }
  }
}
