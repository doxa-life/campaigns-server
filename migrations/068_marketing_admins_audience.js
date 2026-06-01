class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class MarketingAdminsAudienceMigration extends BaseMigration {
  id = 68
  name = 'Allow people_group and admins audience for marketing emails'

  async up(sql) {
    // Migration 036 merged campaigns into people_groups but never updated this
    // CHECK constraint, so it still only allowed ('doxa', 'campaign'). That
    // silently blocked every people_group send. Migrate any legacy 'campaign'
    // rows, then widen the constraint and add the 'admins' test audience.
    console.log('  Migrating legacy campaign audience_type to people_group...')
    await this.exec(sql, `
      UPDATE marketing_emails SET audience_type = 'people_group'
      WHERE audience_type = 'campaign'
    `)

    console.log('  Updating marketing_emails audience_type check constraint...')
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      DROP CONSTRAINT IF EXISTS marketing_emails_audience_type_check
    `)
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      ADD CONSTRAINT marketing_emails_audience_type_check
      CHECK (audience_type IN ('doxa', 'people_group', 'admins'))
    `)
    console.log('  ✅ audience_type now allows doxa, people_group, admins')
  }
}
