class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class MarketingInactivePgAudienceMigration extends BaseMigration {
  id = 91
  name = 'Add doxa_inactive_pg marketing audience'

  async up(sql) {
    console.log('📥 Adding doxa_inactive_pg marketing audience...')

    // Widen the audience_type constraint to allow the inactive-subscribers audience
    // (Doxa-consented contacts whose subscriptions all lapsed into 'inactive').
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      DROP CONSTRAINT IF EXISTS marketing_emails_audience_type_check
    `)
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      ADD CONSTRAINT marketing_emails_audience_type_check
      CHECK (audience_type IN ('doxa', 'people_group', 'admins', 'doxa_active_pg', 'active_pg', 'pick', 'doxa_inactive_pg'))
    `)
    console.log('  ✅ audience_type now allows doxa, people_group, admins, doxa_active_pg, active_pg, pick, doxa_inactive_pg')

    console.log('🎉 Marketing doxa_inactive_pg audience migration completed!')
  }
}
