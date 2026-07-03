class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async tableExists(sql, table) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${table}
      ) as exists
    `
    return result[0]?.exists || false
  }
}

export default class PushSubscriptionsMigration extends BaseMigration {
  id = 90
  name = 'Push subscriptions (OneSignal device registration)'

  async up(sql) {
    console.log('📥 Creating push_subscriptions table...')

    if (await this.tableExists(sql, 'push_subscriptions')) {
      console.log('  ℹ️  push_subscriptions already exists')
      return
    }

    // One row per registered OneSignal device. `external_id` is the profileId
    // (or trackingId fallback) the app passed to OneSignal.login — the field the
    // future server-side sender targets by. The raw subscription id and platform
    // are kept for per-device targeting and debugging. Keyed by subscription id
    // so a reinstall/resubscribe upserts rather than duplicates.
    await this.exec(sql, `
      CREATE TABLE push_subscriptions (
        id SERIAL PRIMARY KEY,
        subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
        onesignal_subscription_id TEXT NOT NULL UNIQUE,
        external_id TEXT,
        platform TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await this.exec(sql, `
      CREATE INDEX idx_push_subscriptions_subscriber_id
        ON push_subscriptions (subscriber_id)
    `)

    console.log('🎉 push_subscriptions migration completed!')
  }

  async down(sql) {
    await this.exec(sql, `DROP TABLE IF EXISTS push_subscriptions`)
  }
}
