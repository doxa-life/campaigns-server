class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class MarketingActivePgAudienceMigration extends BaseMigration {
  id = 74
  name = 'Add active_pg marketing audience'

  async up(sql) {
    console.log('📥 Adding active_pg marketing audience...')

    // Widen the audience_type constraint to allow the all-active-subscribers audience.
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      DROP CONSTRAINT IF EXISTS marketing_emails_audience_type_check
    `)
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      ADD CONSTRAINT marketing_emails_audience_type_check
      CHECK (audience_type IN ('doxa', 'people_group', 'admins', 'doxa_active_pg', 'active_pg', 'pick'))
    `)
    console.log('  ✅ audience_type now allows doxa, people_group, admins, doxa_active_pg, active_pg, pick')

    console.log('🎉 Marketing active_pg audience migration completed!')
  }
}
