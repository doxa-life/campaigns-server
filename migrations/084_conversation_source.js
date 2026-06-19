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

export default class ConversationSourceMigration extends BaseMigration {
  id = 84
  name = 'Add source column to conversations'

  async up(sql) {
    // `source` records how a conversation came into existence — 'contact_form'
    // (Contact-us submission), 'inbound_email' (received mail), or 'staff'
    // (admin-composed). It is the conversation's own marker of its origin;
    // previously this could only be inferred from the subscriber's sources or
    // from activity logs. NULL means the origin is unknown (rows that predate
    // this column and have no matching creation log).
    const exists = await this.columnExists(sql, 'conversations', 'source')
    if (!exists) {
      await this.exec(sql, `
        ALTER TABLE conversations
        ADD COLUMN source TEXT
      `)
    }

    // Backfill from the earliest CREATE activity log per conversation. The inbound
    // path also writes CREATE logs on later replies, so take the earliest entry
    // (DISTINCT ON ordered by timestamp) to capture the origin, not a follow-up.
    await this.exec(sql, `
      WITH first_create AS (
        SELECT DISTINCT ON (record_id)
               record_id,
               metadata->>'message' AS msg
        FROM activity_logs
        WHERE table_name = 'conversations' AND event_type = 'CREATE'
        ORDER BY record_id, timestamp ASC
      )
      UPDATE conversations c
      SET source = CASE
        WHEN fc.msg = 'Contact form conversation opened' THEN 'contact_form'
        WHEN fc.msg LIKE 'Inbound email%' THEN 'inbound_email'
        WHEN fc.msg = 'New email queued' THEN 'staff'
      END
      FROM first_create fc
      WHERE c.id::text = fc.record_id
        AND c.source IS NULL
        AND (
          fc.msg = 'Contact form conversation opened'
          OR fc.msg LIKE 'Inbound email%'
          OR fc.msg = 'New email queued'
        )
    `)
  }
}
