class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async columnExists(sql, table, column) {
    const result = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    `
    return result.length > 0
  }
}

export default class InboxAiDraftingMigration extends BaseMigration {
  id = 80
  name = 'AI inbox drafting: knowledge base, grounding cache, message AI metadata'

  async up(sql) {
    // Captured Q&A knowledge base — grown from real (anonymised) resolved threads.
    // Read as reference grounding when drafting; never sent verbatim.
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS inbox_knowledge_entries (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        language VARCHAR(8) NOT NULL DEFAULT 'en',
        source_conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_inbox_knowledge_status ON inbox_knowledge_entries (status)`)

    // Cross-app grounding cache — snapshots of doxa.life CMS pages (FAQ, about, etc.)
    // so drafting never depends on the marketing site being reachable at request time.
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS grounding_documents (
        id SERIAL PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        doc_key VARCHAR(128) NOT NULL,
        title TEXT,
        body_text TEXT NOT NULL,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (source, doc_key)
      )
    `)

    // AI metadata on outbound draft messages. ai_metadata holds the reviewer-facing
    // English gloss, sources used, and uncertainty notes — shown in the composer, not sent.
    if (!(await this.columnExists(sql, 'conversation_messages', 'ai_generated'))) {
      await this.exec(sql, `ALTER TABLE conversation_messages ADD COLUMN ai_generated BOOLEAN NOT NULL DEFAULT false`)
    }
    if (!(await this.columnExists(sql, 'conversation_messages', 'ai_metadata'))) {
      await this.exec(sql, `ALTER TABLE conversation_messages ADD COLUMN ai_metadata JSONB`)
    }
  }
}
