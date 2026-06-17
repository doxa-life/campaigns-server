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
}

export default class SubscriptionRemindersPausedMigration extends BaseMigration {
  id = 82
  name = 'Add reminders_paused to campaign_subscriptions (mute daily reminders while still praying)'

  async up(sql) {
    // A muted reminder keeps status='active' (still a praying subscriber, still
    // receives the monthly follow-up check-in) but is skipped by the reminder
    // scheduler so no daily email is sent. Distinct from status changes, which
    // govern the prayer commitment itself.
    if (!(await this.columnExists(sql, 'campaign_subscriptions', 'reminders_paused'))) {
      await this.exec(sql, `ALTER TABLE campaign_subscriptions ADD COLUMN reminders_paused BOOLEAN NOT NULL DEFAULT false`)
    }
  }
}
