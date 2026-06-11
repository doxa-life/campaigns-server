import { getSql } from '#server/database/db'

interface FrequencyBucket {
  subscribers: number
  eligible_periods: number
  showed_up_periods: number
  show_up_rate: number | null
}

/**
 * Prayer engagement stats for the admin dashboard Prayer tab.
 *
 * - daily / weekly: subscribers with at least one active subscription of that
 *   frequency (anyone with a daily subscription counts as daily, so the two
 *   groups are disjoint), each with a show-up rate matching the commitment
 *   cadence:
 *   - daily: the share of subscribers who pray at least 4 of every 7 eligible
 *     days (attendance >= 4/7 over their eligible days in the last 30) —
 *     praying most days counts as praying daily, without demanding a perfect
 *     streak. Eligible days are calendar days.
 *   - weekly: pooled across 7-day blocks ending today over the last 4 weeks,
 *     SUM(blocks with at least one prayer day) / SUM(eligible blocks).
 *   Eligible periods start at the subscriber's earliest qualifying
 *   subscription, so recent signups aren't graded on time before they
 *   committed. "Prayed on a day" means at least one prayer_activity row that
 *   UTC day under the subscriber's tracking_id, for any people group.
 * - praying: unique people (distinct tracking_ids) with prayer_activity in
 *   the window. Every web visitor carries a tracking_id (cookie/localStorage),
 *   so a non-null value alone doesn't identify anyone — "tracked" means the
 *   tracking_id matches a subscribers row (reminder-email links carry the
 *   subscriber's tracking_id via ?uid=). Tracked is a floor: a subscriber
 *   praying on a device without that link counts as anonymous. Sessions
 *   recorded without any tracking_id can't be attributed to a person and are
 *   excluded rather than counted per-row.
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
            CASE WHEN has_daily THEN CURRENT_DATE - 29 ELSE CURRENT_DATE - 27 END,
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
          CASE WHEN c.bucket = 'daily'
            THEN CURRENT_DATE - c.window_start + 1
            ELSE CEIL((CURRENT_DATE - c.window_start + 1) / 7.0)
          END AS eligible_periods,
          CASE WHEN c.bucket = 'daily'
            THEN COUNT(ad.day)
            ELSE COUNT(DISTINCT (CURRENT_DATE - ad.day) / 7)
          END AS showed_up_periods
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
        COALESCE(SUM(eligible_periods), 0)::int AS eligible_periods,
        COALESCE(SUM(LEAST(showed_up_periods, eligible_periods)), 0)::int AS showed_up_periods,
        (COUNT(*) FILTER (WHERE showed_up_periods * 7 >= eligible_periods * 4))::int AS meeting_cadence
      FROM per_sub
      GROUP BY bucket
    `,
    sql`
      SELECT
        (COUNT(DISTINCT pa.tracking_id) FILTER (WHERE s.id IS NOT NULL))::int AS tracked,
        (COUNT(DISTINCT pa.tracking_id) FILTER (WHERE s.id IS NULL))::int AS anonymous
      FROM prayer_activity pa
      LEFT JOIN subscribers s ON s.tracking_id = pa.tracking_id
      WHERE pa.timestamp >= (CURRENT_DATE - 29)::timestamp
    `
  ])

  const emptyBucket = (): FrequencyBucket =>
    ({ subscribers: 0, eligible_periods: 0, showed_up_periods: 0, show_up_rate: null })

  const buckets: Record<'daily' | 'weekly', FrequencyBucket> = {
    daily: emptyBucket(),
    weekly: emptyBucket()
  }

  for (const row of frequencyRows as any[]) {
    const bucket = row.bucket as 'daily' | 'weekly'
    const subscribers = Number(row.subscribers)
    const eligiblePeriods = Number(row.eligible_periods)
    const showedUpPeriods = Number(row.showed_up_periods)
    buckets[bucket] = {
      subscribers,
      eligible_periods: eligiblePeriods,
      showed_up_periods: showedUpPeriods,
      show_up_rate: bucket === 'daily'
        ? (subscribers > 0 ? Number(row.meeting_cadence) / subscribers : null)
        : (eligiblePeriods > 0 ? showedUpPeriods / eligiblePeriods : null)
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
