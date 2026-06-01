import { getSql } from '../database/db'

/**
 * Update the people_praying and daily_prayer_duration columns for all people groups
 * - people_praying: average number of unique people praying daily over the last 7 days
 * - daily_prayer_duration: average total prayer duration per day over the last 7 days (in seconds)
 */
export async function updatePrayerStats(): Promise<void> {
  const sql = getSql()

  await sql`
    UPDATE people_groups pg
    SET
      people_praying = COALESCE(stats.avg_daily_count, 0),
      daily_prayer_duration = COALESCE(stats.total_duration / 7, 0)
    FROM (
      SELECT
        people_group_id,
        ROUND(AVG(daily_count))::integer as avg_daily_count,
        SUM(daily_duration)::integer as total_duration
      FROM (
        SELECT
          people_group_id,
          DATE(timestamp) as prayer_date,
          COUNT(DISTINCT COALESCE(tracking_id, id::text)) as daily_count,
          SUM(duration) as daily_duration
        FROM prayer_activity
        WHERE timestamp >= NOW() - INTERVAL '7 days'
        GROUP BY people_group_id, DATE(timestamp)
      ) daily_stats
      GROUP BY people_group_id
    ) stats
    WHERE pg.id = stats.people_group_id
  `

  // Reset people groups with no recent activity to 0
  await sql`
    UPDATE people_groups
    SET people_praying = 0, daily_prayer_duration = 0
    WHERE id NOT IN (
      SELECT DISTINCT people_group_id
      FROM prayer_activity
      WHERE timestamp >= NOW() - INTERVAL '7 days'
        AND people_group_id IS NOT NULL
    )
  `
}
