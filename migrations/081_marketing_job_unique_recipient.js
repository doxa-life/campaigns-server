class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class MarketingJobUniqueRecipientMigration extends BaseMigration {
  id = 81
  name = 'One marketing-email job per recipient'

  async up(sql) {
    console.log('📥 Enforcing one marketing-email job per recipient...')

    // Drop any pre-existing duplicate jobs (same campaign + same recipient address),
    // keeping the earliest row, so the unique index below can build cleanly.
    await this.exec(sql, `
      DELETE FROM jobs a
      USING jobs b
      WHERE a.type = 'marketing_email'
        AND b.type = 'marketing_email'
        AND a.reference_id = b.reference_id
        AND lower(a.payload->>'recipient_email') = lower(b.payload->>'recipient_email')
        AND a.id > b.id
    `)

    // Backstop against double-enqueue: a campaign (reference_id) can hold at most one
    // job per recipient email. Keyed on the email — NOT contact_method_id — because the
    // admins/test audience enqueues every recipient with contact_method_id = 0, which a
    // contact_method_id-based index would collapse into a single job.
    await this.exec(sql, `
      CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_marketing_recipient
      ON jobs (reference_id, (lower(payload->>'recipient_email')))
      WHERE type = 'marketing_email'
    `)
    console.log('  ✅ Created uq_jobs_marketing_recipient')

    console.log('🎉 Marketing job unique-recipient migration completed!')
  }
}
