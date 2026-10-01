class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ActivityEmailTotalsIncludeApp extends BaseMigration {
  id = 117
  name = 'Count mobile app subscribers in stored activity email totals'

  async up(sql) {
    // Each stored total counted contacts with a verified email. Add the contacts
    // that had an active app subscription at send time but no verified email yet,
    // so the next email's change compares like with like. An app subscription
    // counts as active at send time when it is active now, or stopped after it.
    await sql`
      UPDATE activity_logs al
      SET metadata = jsonb_set(
        al.metadata,
        '{stats,totalSubscribers}',
        to_jsonb((al.metadata->'stats'->>'totalSubscribers')::int + (
          SELECT COUNT(DISTINCT cs.subscriber_id)
          FROM campaign_subscriptions cs
          WHERE cs.delivery_method = 'app'
            AND cs.people_group_id IS NOT NULL
            AND cs.created_at < to_timestamp(al.timestamp / 1000.0) AT TIME ZONE 'UTC'
            AND (
              cs.status = 'active'
              OR (cs.status IN ('inactive', 'unsubscribed') AND cs.updated_at >= to_timestamp(al.timestamp / 1000.0) AT TIME ZONE 'UTC')
            )
            AND NOT EXISTS (
              SELECT 1 FROM contact_methods cm
              WHERE cm.subscriber_id = cs.subscriber_id
                AND cm.type = 'email'
                AND cm.verified = true
                AND (cm.verified_at IS NULL OR cm.verified_at < to_timestamp(al.timestamp / 1000.0) AT TIME ZONE 'UTC')
            )
        ))
      )
      WHERE al.event_type = 'ACTIVITY_EMAIL_SENT'
        AND al.metadata->'stats'->>'totalSubscribers' IS NOT NULL
    `
  }
}
