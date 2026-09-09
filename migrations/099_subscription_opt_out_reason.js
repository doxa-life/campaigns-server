class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async columnExists(sql, table, column) {
    const result = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    `
    return result.length > 0
  }

  async indexExists(sql, indexName) {
    const result = await sql`
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${indexName}
    `
    return result.length > 0
  }
}

export default class SubscriptionOptOutReasonMigration extends BaseMigration {
  id = 99
  name = 'Add opt-out reason to campaign_subscriptions (why a prayer time was muted or stopped)'

  async up(sql) {
    // Why the subscriber last reduced notifications for this prayer time: either
    // muting the daily email while still praying, or stopping the prayer time
    // itself. The row's status and reminders_paused say which of the two it was.
    // Cleared whenever the reminder is resumed or resubscribed, so a value here
    // always describes the current reduced state.
    //
    // opt_out_reason holds a key from config/opt-out-reasons.ts; the wording shown
    // to people lives in the i18n locale files, never in the database.
    if (!(await this.columnExists(sql, 'campaign_subscriptions', 'opt_out_reason'))) {
      await this.exec(sql, `ALTER TABLE campaign_subscriptions ADD COLUMN opt_out_reason TEXT`)
    }

    if (!(await this.columnExists(sql, 'campaign_subscriptions', 'opt_out_reason_text'))) {
      await this.exec(sql, `ALTER TABLE campaign_subscriptions ADD COLUMN opt_out_reason_text TEXT`)
    }

    // Separate from updated_at, which any edit to the row bumps. The dashboard
    // scopes its breakdown by this timestamp.
    if (!(await this.columnExists(sql, 'campaign_subscriptions', 'opt_out_reason_at'))) {
      await this.exec(sql, `ALTER TABLE campaign_subscriptions ADD COLUMN opt_out_reason_at TIMESTAMP`)
    }

    if (!(await this.indexExists(sql, 'idx_campaign_subscriptions_opt_out_reason'))) {
      await this.exec(sql, `
        CREATE INDEX idx_campaign_subscriptions_opt_out_reason
        ON campaign_subscriptions(opt_out_reason_at DESC, opt_out_reason)
        WHERE opt_out_reason IS NOT NULL
      `)
    }
  }
}
