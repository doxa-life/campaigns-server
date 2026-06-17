class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async columnExists(sql, tableName, columnName) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      ) as exists
    `
    return result[0]?.exists || false
  }
}

export default class ConversationTagsMigration extends BaseMigration {
  id = 83
  name = 'Add tags column to conversations'

  async up(sql) {
    // Tags are stored denormalised as a JSONB array of tag slugs on each
    // conversation. The slug→{name,color} palette lives in app_config under the
    // `inbox_tags` key, so colours and labels have a single source of truth.
    const exists = await this.columnExists(sql, 'conversations', 'tags')
    if (!exists) {
      await this.exec(sql, `
        ALTER TABLE conversations
        ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'::jsonb
      `)
    }

    // GIN index supports fast containment filtering (tags @> '["bug-report"]').
    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_conversations_tags
      ON conversations USING GIN (tags)
    `)
  }
}
