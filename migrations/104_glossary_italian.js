import { seedGlossaryLanguage } from './lib/glossary-seed.js'

class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class GlossaryItalianMigration extends BaseMigration {
  id = 104
  name = 'Seed the Italian glossary'

  async up(sql) {
    // Migration 101 seeds every file in data/glossary/languages, so a database
    // created after Italian was added there already has it; this covers the
    // databases created before. The seeder leaves an existing language alone.
    await seedGlossaryLanguage(sql, 'it')
  }
}
