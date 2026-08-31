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

export default class InboxCcMigration extends BaseMigration {
  id = 94
  name = 'Inbox: CC recipients on outbound conversation messages'

  async up(sql) {
    // CC addresses chosen at compose time, sent by the outbound-email processor.
    // NULL = no CC. Stored normalized (trimmed, lowercased, deduped).
    if (!(await this.columnExists(sql, 'conversation_messages', 'cc_emails'))) {
      await this.exec(sql, `ALTER TABLE conversation_messages ADD COLUMN cc_emails TEXT[]`)
    }
  }
}
