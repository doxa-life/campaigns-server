class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PendingSubscriptionStatusMigration extends BaseMigration {
  id = 54
  name = 'Add pending status to campaign_subscriptions and backfill unverified'

  async up(sql) {
    console.log('  Updating status CHECK constraint to include pending...')
    await this.exec(sql, `
      ALTER TABLE campaign_subscriptions DROP CONSTRAINT campaign_subscriptions_status_check
    `)
    await this.exec(sql, `
      ALTER TABLE campaign_subscriptions ADD CONSTRAINT campaign_subscriptions_status_check
        CHECK (status IN ('active', 'inactive', 'unsubscribed', 'pending'))
    `)

    console.log('  Backfilling unverified email subscriptions to pending...')
    await this.exec(sql, `
      UPDATE campaign_subscriptions cs
      SET status = 'pending', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      FROM contact_methods cm
      WHERE cm.subscriber_id = cs.subscriber_id
        AND cm.type = 'email'
        AND cm.verified = false
        AND cs.status = 'active'
        AND cs.delivery_method = 'email'
    `)

    console.log('  ✅ Pending subscription status added and backfilled')
  }
}
