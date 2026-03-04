class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ActivityEmailPreferences extends BaseMigration {
  id = 41
  name = 'Add activity email preferences to users'

  async up(sql) {
    await this.exec(sql, `
      ALTER TABLE users
      ADD COLUMN activity_email_preferences JSONB
      DEFAULT '{"daily":true,"weekly":true,"monthly":true,"yearly":true}'
    `)
    console.log('✅ Added activity_email_preferences column to users table')
  }
}
