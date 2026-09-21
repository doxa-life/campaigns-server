import { seedGlossaryLanguage } from './lib/glossary-seed.js'

class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class GlossaryHindiMigration extends BaseMigration {
  id = 107
  name = 'Seed the Hindi glossary'

  async up(sql) {
    // Migration 101 seeds every file in data/glossary/languages, so a database
    // created after Hindi was added there already has it; this covers the
    // databases created before. The seeder leaves an existing language alone.
    await seedGlossaryLanguage(sql, 'hi')
  }
}
