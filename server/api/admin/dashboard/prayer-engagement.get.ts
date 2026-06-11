import { getSql } from '#server/database/db'

interface FrequencyBucket {
  subscribers: number
  eligible_days: number
  showed_up_days: number
  show_up_rate: number | null
}

/**
 * Prayer engagement stats for the admin dashboard Prayer tab.
 *
 * - daily / weekly: subscribers with at least one active subscription of that
 *   frequency (anyone with a daily subscription counts as daily, so the two
 *   groups are disjoint), with a pooled show-up rate over the last 30 calendar
 *   days: SUM(days the subscriber prayed) / SUM(eligible days). Eligible days
 *   start at the subscriber's earliest qualifying subscription, so recent
 *   signups aren't graded on days before they committed. "Prayed on a day"
 *   means at least one prayer_activity row that UTC day under the
 *   subscriber's tracking_id, for any people group.
 * - praying: unique people with prayer_activity in the window. Every web
 *   visitor carries a tracking_id (cookie/localStorage), so a non-null value
 *   alone doesn't identify anyone — "tracked" means the tracking_id matches a
 *   subscribers row (reminder-email links carry the subscriber's tracking_id
 *   via ?uid=). Tracked is a floor: a subscriber praying on a device without
 *   that link counts as anonymous.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()

  const [frequencyRows, prayingRows] = await Promise.all([
    sql`
      WITH grp AS (
        SELECT
          cs.subscriber_id,
          s.tracking_id,
          BOOL_OR(cs.frequency = 'daily') AS has_daily,
          (MIN(cs.created_at) FILTER (WHERE cs.frequency = 'daily'))::date AS first_daily,
          (MIN(cs.created_at) FILTER (WHERE cs.frequency = 'weekly'))::date AS first_weekly
        FROM campaign_subscriptions cs
        JOIN subscribers s ON s.id = cs.subscriber_id
        WHERE cs.status = 'active'
          AND cs.frequency IN ('daily', 'weekly')
        GROUP BY cs.subscriber_id, s.tracking_id
      ),
      classified AS (
        SELECT
          subscriber_id,
          tracking_id,
          CASE WHEN has_daily THEN 'daily' ELSE 'weekly' END AS bucket,
          GREATEST(
            CURRENT_DATE - 29,
            CASE WHEN has_daily THEN first_daily ELSE first_weekly END
          ) AS window_start
        FROM grp
      ),
      activity_days AS (
        SELECT tracking_id, DATE(timestamp) AS day
        FROM prayer_activity
        WHERE timestamp >= (CURRENT_DATE - 29)::timestamp
          AND tracking_id IS NOT NULL
        GROUP BY tracking_id, DATE(timestamp)
      ),
      per_sub AS (
        SELECT
          c.bucket,
          CURRENT_DATE - c.window_start + 1 AS eligible_days,
          COUNT(ad.day) AS showed_up_days
        FROM classified c
        LEFT JOIN activity_days ad
          ON ad.tracking_id = c.tracking_id
         AND ad.day >= c.window_start
         AND ad.day <= CURRENT_DATE
        GROUP BY c.subscriber_id, c.bucket, c.window_start
      )
      SELECT
        bucket,
        COUNT(*)::int AS subscribers,
        COALESCE(SUM(eligible_days), 0)::int AS eligible_days,
        COALESCE(SUM(LEAST(showed_up_days, eligible_days)), 0)::int AS showed_up_days
      FROM per_sub
      GROUP BY bucket
    `,
    sql`
      SELECT
        (COUNT(DISTINCT pa.tracking_id) FILTER (WHERE s.id IS NOT NULL))::int AS tracked,
        (COUNT(DISTINCT COALESCE(pa.tracking_id, pa.id::text)) FILTER (WHERE s.id IS NULL))::int AS anonymous
      FROM prayer_activity pa
      LEFT JOIN subscribers s ON s.tracking_id = pa.tracking_id
      WHERE pa.timestamp >= (CURRENT_DATE - 29)::timestamp
    `
  ])

  const emptyBucket = (): FrequencyBucket =>
    ({ subscribers: 0, eligible_days: 0, showed_up_days: 0, show_up_rate: null })

  const buckets: Record<'daily' | 'weekly', FrequencyBucket> = {
    daily: emptyBucket(),
    weekly: emptyBucket()
  }

  for (const row of frequencyRows as any[]) {
    const bucket = row.bucket as 'daily' | 'weekly'
    const eligibleDays = Number(row.eligible_days)
    const showedUpDays = Number(row.showed_up_days)
    buckets[bucket] = {
      subscribers: Number(row.subscribers),
      eligible_days: eligibleDays,
      showed_up_days: showedUpDays,
      show_up_rate: eligibleDays > 0 ? showedUpDays / eligibleDays : null
    }
  }

  return {
    daily: buckets.daily,
    weekly: buckets.weekly,
    praying: {
      tracked: Number((prayingRows[0] as any)?.tracked ?? 0),
      anonymous: Number((prayingRows[0] as any)?.anonymous ?? 0)
    }
  }
})
