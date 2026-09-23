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

export default class InboxMessageTranslationsMigration extends BaseMigration {
  id = 114
  name = 'Saved per-language translations on inbox messages'

  async up(sql) {
    // Object keyed by language code, so one language is added or replaced atomically.
    if (!(await this.columnExists(sql, 'conversation_messages', 'translations'))) {
      await this.exec(sql, `ALTER TABLE conversation_messages ADD COLUMN translations JSONB`)
    }
  }

  async down(sql) {
    await this.exec(sql, `ALTER TABLE conversation_messages DROP COLUMN IF EXISTS translations`)
  }
}
