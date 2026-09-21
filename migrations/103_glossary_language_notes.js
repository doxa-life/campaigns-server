class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async tableExists(sql, table) {
    const result = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `
    return result.length > 0
  }

  async indexExists(sql, indexName) {
    const result = await sql`
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${indexName}
    `
    return result.length > 0
  }
}

export default class GlossaryLanguageNotesMigration extends BaseMigration {
  id = 103
  name = 'Add per-language translation notes to the glossary'

  async up(sql) {
    // Rules that belong to a language rather than to any one term: register and
    // form of address, the verb pair prayer prompts use, acronym policy, number
    // and date conventions, script and name handling. They ride in every
    // translation request alongside the term list, so the text stays short.
    await this.exec(sql, `
      ALTER TABLE glossary_languages
      ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''
    `)

    // Notes are edited through the same unauthenticated magic link as the
    // terms, so every write is attributed and restorable.
    if (!(await this.tableExists(sql, 'glossary_language_note_revisions'))) {
      await this.exec(sql, `
        CREATE TABLE glossary_language_note_revisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          language_id UUID NOT NULL REFERENCES glossary_languages(id) ON DELETE CASCADE,
          notes TEXT NOT NULL,
          reviewer_name TEXT,
          pass_id UUID REFERENCES glossary_review_passes(id) ON DELETE SET NULL,
          source TEXT NOT NULL DEFAULT 'review',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_glossary_note_revisions_language'))) {
      await this.exec(sql, `
        CREATE INDEX idx_glossary_note_revisions_language
        ON glossary_language_note_revisions(language_id, created_at DESC)
      `)
    }
  }
}
