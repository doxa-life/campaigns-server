class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class NullableSubscriptionTimePreferenceMigration extends BaseMigration {
  id = 72
  name = 'Allow campaign_subscriptions.time_preference to be NULL (no-time app signups)'

  async up(sql) {
    await this.exec(sql, `
      ALTER TABLE campaign_subscriptions
      ALTER COLUMN time_preference DROP NOT NULL
    `)
  }

  async down(sql) {
    await this.exec(sql, `
      ALTER TABLE campaign_subscriptions
      ALTER COLUMN time_preference SET NOT NULL
    `)
  }
}
