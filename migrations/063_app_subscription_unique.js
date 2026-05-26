class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class AppSubscriptionUniqueMigration extends BaseMigration {
  id = 63
  name = 'Enforce one app subscription per (subscriber, people_group)'

  async up(sql) {
    console.log('  Removing any duplicate app subscriptions (keeping the newest)...')
    await this.exec(sql, `
      DELETE FROM campaign_subscriptions
      WHERE delivery_method = 'app'
        AND id NOT IN (
          SELECT DISTINCT ON (subscriber_id, people_group_id) id
          FROM campaign_subscriptions
          WHERE delivery_method = 'app'
          ORDER BY subscriber_id, people_group_id, created_at DESC, id DESC
        )
    `)

    console.log('  Adding partial unique index on (subscriber_id, people_group_id) for app subs...')
    await this.exec(sql, `
      CREATE UNIQUE INDEX IF NOT EXISTS campaign_subscriptions_app_unique
      ON campaign_subscriptions (subscriber_id, people_group_id)
      WHERE delivery_method = 'app'
    `)
    console.log('  ✅ App subscription uniqueness enforced')
  }
}
