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

export default class ContactMethodDeliverabilityMigration extends BaseMigration {
  id = 79
  name = 'Contact method deliverability'

  async up(sql) {
    console.log('📥 Consolidating email deliverability onto contact_methods...')

    // Deliverability state lives on the address record itself (alongside verified +
    // consents), making contact_methods the single registry for every email we touch.
    // Fed by the Mailgun delivery webhook; consumed by every recipient query.
    if (!(await this.columnExists(sql, 'contact_methods', 'suppressed_at'))) {
      await this.exec(sql, `
        ALTER TABLE contact_methods
          ADD COLUMN suppressed_at TIMESTAMP,
          ADD COLUMN suppression_reason TEXT,
          ADD COLUMN suppression_detail TEXT,
          ADD COLUMN bounce_count INTEGER NOT NULL DEFAULT 0
      `)
      console.log('  ✅ Added suppressed_at, suppression_reason, suppression_detail, bounce_count')
    } else {
      console.log('  ℹ️  deliverability columns already exist')
    }

    // Allow registry-only rows: addresses we've interacted with (e.g. bounced test
    // sends or inbox correspondents) that aren't tied to a subscriber.
    await this.exec(sql, `ALTER TABLE contact_methods ALTER COLUMN subscriber_id DROP NOT NULL`)
    console.log('  ✅ contact_methods.subscriber_id is now nullable')

    // Partial index to keep the "suppressed addresses" scans cheap.
    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_contact_methods_suppressed
      ON contact_methods (suppressed_at) WHERE suppressed_at IS NOT NULL
    `)

    console.log('🎉 Contact method deliverability migration completed!')
  }
}
