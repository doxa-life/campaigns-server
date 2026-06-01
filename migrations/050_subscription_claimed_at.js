class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class SubscriptionClaimedAtMigration extends BaseMigration {
  id = 50
  name = 'Add claimed_at to campaign_subscriptions for multi-instance claim tracking'

  async up(sql) {
    await this.exec(sql, `
      ALTER TABLE campaign_subscriptions
      ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NULL
    `)
  }

  async down(sql) {
    await this.exec(sql, `
      ALTER TABLE campaign_subscriptions
      DROP COLUMN IF EXISTS claimed_at
    `)
  }
}
