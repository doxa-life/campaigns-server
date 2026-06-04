class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class MarketingEmailCancelledStatusMigration extends BaseMigration {
  id = 76
  name = 'Add cancelled status for marketing emails'

  async up(sql) {
    console.log('📥 Adding cancelled status for marketing emails...')

    // Widen the status constraint so an in-progress send can be stopped.
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      DROP CONSTRAINT IF EXISTS marketing_emails_status_check
    `)
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      ADD CONSTRAINT marketing_emails_status_check
      CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'failed', 'cancelled'))
    `)
    console.log('  ✅ status now allows draft, queued, sending, sent, failed, cancelled')

    console.log('🎉 Marketing email cancelled status migration completed!')
  }
}
