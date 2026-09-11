class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class SubscriptionAttributionMigration extends BaseMigration {
  id = 95
  name = 'Signup attribution (UTM parameters and referrer) on campaign_subscriptions'

  async up(sql) {
    console.log('  Adding attribution columns to campaign_subscriptions...')
    // Where the visitor came from when they signed up: the utm_* parameters on
    // the link they arrived through and the referring page. NULL when the
    // signup was a direct visit or arrived through an untagged link.
    await this.exec(sql, `
      ALTER TABLE campaign_subscriptions
        ADD COLUMN IF NOT EXISTS utm_source TEXT,
        ADD COLUMN IF NOT EXISTS utm_medium TEXT,
        ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
        ADD COLUMN IF NOT EXISTS referrer TEXT
    `)
    console.log('  ✅ Attribution columns added')
  }
}
