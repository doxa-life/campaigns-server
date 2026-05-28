class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async columnExists(sql, table, column) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
      ) as exists
    `
    return result[0]?.exists || false
  }
}

export default class MarketingSendersMigration extends BaseMigration {
  id = 69
  name = 'Marketing senders'

  async up(sql) {
    console.log('📥 Creating marketing_senders table...')

    // Each sender is a From identity on the single MARKETING_MAILGUN_DOMAIN.
    // Only the local_part + display name vary; the domain is appended at send
    // time so the From always aligns with the marketing Mailgun domain's DKIM.
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS marketing_senders (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        local_part TEXT NOT NULL,
        reply_to TEXT,
        is_default BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      )
    `)

    // Unique local part among active senders (soft-deleted rows may collide).
    await this.exec(sql, `
      CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_senders_local_part
      ON marketing_senders (local_part) WHERE active = true
    `)

    // At most one default sender.
    await this.exec(sql, `
      CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_senders_default
      ON marketing_senders (is_default) WHERE is_default = true
    `)

    console.log('  ✅ marketing_senders table created')

    if (!(await this.columnExists(sql, 'marketing_emails', 'sender_id'))) {
      await this.exec(sql, `
        ALTER TABLE marketing_emails
        ADD COLUMN sender_id INTEGER REFERENCES marketing_senders(id)
      `)
      console.log('  ✅ Added sender_id to marketing_emails')
    } else {
      console.log('  ℹ️  sender_id already exists on marketing_emails')
    }

    console.log('🎉 Marketing senders migration completed!')
  }
}
