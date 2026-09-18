import { seedGlossaryLanguage } from './lib/glossary-seed.js'

class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class GlossaryRussianMigration extends BaseMigration {
  id = 106
  name = 'Seed the Russian glossary'

  async up(sql) {
    // Migration 101 seeds every file in data/glossary/languages, so a database
    // created after Russian was added there already has it; this covers the
    // databases created before. The seeder leaves an existing language alone.
    await seedGlossaryLanguage(sql, 'ru')
  }
}
