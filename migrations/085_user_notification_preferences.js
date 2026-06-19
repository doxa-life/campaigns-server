class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class UserNotificationPreferences extends BaseMigration {
  id = 85
  name = 'Move notification recipients onto per-user notification_preferences'

  async up(sql) {
    // 1. Consolidated per-user notification settings: stats frequencies plus adoption/contact_us opt-ins.
    await this.exec(sql, `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS notification_preferences JSONB
      DEFAULT '{"stats":{"daily":true,"weekly":true,"monthly":true,"yearly":true},"adoption":false,"contact_us":false}'
    `)

    // 2. Seed stats from the legacy activity_email_preferences column; adoption/contact start off.
    await sql`
      UPDATE users SET notification_preferences = jsonb_build_object(
        'stats', COALESCE(activity_email_preferences, '{"daily":true,"weekly":true,"monthly":true,"yearly":true}'::jsonb),
        'adoption', false,
        'contact_us', false
      )
    `

    // 3. Preserve stats opt-in: previously only users enrolled in the 'stats' recipient group
    //    received summaries. Turn stats off for every eligible user (admin/progress_admin/superadmin)
    //    who was NOT enrolled, so nobody starts receiving who didn't before.
    await sql`
      UPDATE users SET notification_preferences = jsonb_set(
        notification_preferences, '{stats}',
        '{"daily":false,"weekly":false,"monthly":false,"yearly":false}'::jsonb
      )
      WHERE ('admin' = ANY(roles) OR 'progress_admin' = ANY(roles) OR superadmin = TRUE)
        AND LOWER(email) NOT IN (
          SELECT LOWER(email) FROM notification_recipients WHERE group_key = 'stats'
        )
    `

    // 4. Carry over adoption + contact_us recipients that map to an existing user.
    await sql`
      UPDATE users SET notification_preferences = jsonb_set(notification_preferences, '{adoption}', 'true'::jsonb)
      WHERE LOWER(email) IN (SELECT LOWER(email) FROM notification_recipients WHERE group_key = 'adoption')
    `
    await sql`
      UPDATE users SET notification_preferences = jsonb_set(notification_preferences, '{contact_us}', 'true'::jsonb)
      WHERE LOWER(email) IN (SELECT LOWER(email) FROM notification_recipients WHERE group_key = 'contact_us')
    `

    // 5. Surface recipients that don't map to a user — they cannot be migrated and will stop
    //    receiving notifications. The operator can recreate them as users or accept the loss.
    const unmatched = await sql`
      SELECT group_key, email, name FROM notification_recipients nr
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(nr.email))
      ORDER BY group_key, email
    `
    if (unmatched.length > 0) {
      console.warn(`⚠️  ${unmatched.length} notification recipient(s) have no matching user and will no longer receive notifications:`)
      for (const r of unmatched) {
        console.warn(`   - [${r.group_key}] ${r.email}${r.name ? ` (${r.name})` : ''}`)
      }
    }

    // 6. Drop the now-superseded stats-only column.
    await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS activity_email_preferences`)
    console.log('✅ Migrated notification recipients to users.notification_preferences')
  }

  async down(sql) {
    await this.exec(sql, `
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS activity_email_preferences JSONB
      DEFAULT '{"daily":true,"weekly":true,"monthly":true,"yearly":true}'
    `)
    await sql`
      UPDATE users SET activity_email_preferences = notification_preferences->'stats'
      WHERE notification_preferences IS NOT NULL
    `
    await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS notification_preferences`)
  }
}
