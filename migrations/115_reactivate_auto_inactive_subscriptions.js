class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ReactivateAutoInactiveSubscriptionsMigration extends BaseMigration {
  id = 115
  name = 'Reactivate subscriptions the inactivity automations stopped'

  async up(sql) {
    // Each inactive prayer time is classified by its most recent status evidence:
    // the contact's own stop ('manual'), a later yes-answer to a check-in
    // ('praying'), an admin edit ('admin'), or an automation's log ('automatic').
    // Rows with no evidence predate the automations' logging and were set by them.
    const rows = await sql`
      WITH inactive AS (
        SELECT id, subscriber_id, people_group_id, opt_out_reason_at
        FROM campaign_subscriptions
        WHERE status = 'inactive'
      ),
      events AS (
        SELECT i.id,
          CASE WHEN fr.response = 'not_praying' THEN 'manual' ELSE 'praying' END AS kind,
          (EXTRACT(EPOCH FROM fr.responded_at) * 1000)::bigint AS at
        FROM inactive i
        JOIN followup_responses fr ON fr.subscription_id = i.id
        UNION ALL
        SELECT i.id, 'manual', (EXTRACT(EPOCH FROM i.opt_out_reason_at) * 1000)::bigint
        FROM inactive i
        WHERE i.opt_out_reason_at IS NOT NULL
        UNION ALL
        SELECT i.id,
          CASE
            WHEN al.table_name = 'campaign_subscriptions' THEN 'admin'
            WHEN al.metadata->>'badge' = 'Stopped Prayer' THEN 'manual'
            ELSE 'automatic'
          END,
          al.timestamp
        FROM inactive i
        JOIN activity_logs al ON (
          al.table_name = 'campaign_subscriptions'
          AND al.record_id = i.id::text
          AND al.metadata->'changes'->'status'->>'to' = 'inactive'
        ) OR (
          al.table_name = 'subscribers'
          AND al.record_id = i.subscriber_id::text
          AND al.metadata->>'link_url' = '/admin/people-groups/' || i.people_group_id
          AND (
            al.metadata->>'badge' = 'Stopped Prayer'
            OR al.metadata->>'message' LIKE 'Marked inactive%'
          )
        )
      )
      SELECT i.id,
        COALESCE(
          (SELECT e.kind FROM events e WHERE e.id = i.id ORDER BY e.at DESC LIMIT 1),
          'automatic'
        ) AS kind
      FROM inactive i
    `

    const idsOf = kind => rows.filter(r => r.kind === kind).map(r => r.id)
    const manualIds = idsOf('manual')
    const reactivateIds = rows.filter(r => r.kind === 'automatic' || r.kind === 'praying').map(r => r.id)

    // A contact's own stop is recorded as 'unsubscribed', which nothing reactivates.
    if (manualIds.length > 0) {
      await sql`
        UPDATE campaign_subscriptions
        SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ANY(${manualIds})
      `
    }

    if (reactivateIds.length > 0) {
      // Follow-up tracking restarts so a reactivated contact is not sent a
      // check-in straight away; a muted reminder stays muted.
      await sql`
        UPDATE campaign_subscriptions
        SET status = 'active',
            followup_count = 0, followup_reminder_count = 0, last_followup_at = NULL,
            claimed_at = NULL,
            updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ANY(${reactivateIds})
      `

      // The stored next_reminder_utc is long past and would fire at once, at the
      // wrong hour. Move it to the next occurrence of the preferred local time
      // (on a chosen weekday for weekly schedules).
      await sql`
        WITH zoned AS (
          SELECT cs.id, cs.frequency, cs.days_of_week, cs.time_preference,
            CASE
              WHEN cs.timezone IN (SELECT name FROM pg_timezone_names) THEN cs.timezone
              ELSE 'UTC'
            END AS tz
          FROM campaign_subscriptions cs
          WHERE cs.id = ANY(${reactivateIds})
            AND cs.time_preference ~ '^\\d{1,2}:\\d{2}$'
        ),
        next AS (
          SELECT z.id, MIN((c.local_at AT TIME ZONE z.tz) AT TIME ZONE 'UTC') AS next_utc
          FROM zoned z
          CROSS JOIN LATERAL (
            SELECT date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE z.tz)
              + d * INTERVAL '1 day' + z.time_preference::time AS local_at
            FROM generate_series(0, 7) d
          ) c
          WHERE c.local_at > CURRENT_TIMESTAMP AT TIME ZONE z.tz
            AND (
              z.frequency <> 'weekly'
              OR COALESCE(z.days_of_week, '[]') IN ('[]', 'null')
              OR EXTRACT(DOW FROM c.local_at)::int IN (
                SELECT jsonb_array_elements_text(z.days_of_week::jsonb)::int
              )
            )
          GROUP BY z.id
        )
        UPDATE campaign_subscriptions cs
        SET next_reminder_utc = next.next_utc
        FROM next
        WHERE cs.id = next.id
      `

      await sql`
        INSERT INTO activity_logs (timestamp, event_type, table_name, record_id, user_id, metadata)
        SELECT ${Date.now()}, 'CREATE', 'subscribers', cs.subscriber_id::text, NULL,
          jsonb_build_object(
            'source', 'system',
            'message', 'Reactivated — automatic inactivation retired for',
            'link_text', pg.name,
            'link_url', '/admin/people-groups/' || cs.people_group_id
          )
        FROM campaign_subscriptions cs
        JOIN people_groups pg ON pg.id = cs.people_group_id
        WHERE cs.id = ANY(${reactivateIds})
      `
    }

    console.log(`  Reactivated ${reactivateIds.length} automatically inactivated prayer times`)
    console.log(`  Marked ${manualIds.length} contact-stopped prayer times as unsubscribed`)
    console.log(`  Left ${idsOf('admin').length} admin-set prayer times inactive`)
  }
}
