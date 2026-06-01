import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()

  const [languageRows, timeLocalRows, timeUtcRows, durationRows] = await Promise.all([
    sql`
      SELECT COALESCE(s.preferred_language, 'en') as language, COUNT(DISTINCT cs.subscriber_id) as count
      FROM campaign_subscriptions cs
      JOIN subscribers s ON s.id = cs.subscriber_id
      WHERE cs.status = 'active'
      GROUP BY COALESCE(s.preferred_language, 'en')
      ORDER BY count DESC
    `,
    sql`
      SELECT
        (EXTRACT(HOUR FROM time_preference::time)::int * 12
          + (EXTRACT(MINUTE FROM time_preference::time)::int / 5)) as bucket,
        COUNT(*) as count
      FROM campaign_subscriptions
      WHERE status = 'active'
        AND time_preference ~ '^[0-9]{1,2}:[0-9]{2}'
      GROUP BY bucket
      ORDER BY bucket
    `,
    sql`
      SELECT
        EXTRACT(HOUR FROM utc_local)::int * 12
          + (EXTRACT(MINUTE FROM utc_local)::int / 5) as bucket,
        COUNT(*) as count
      FROM (
        SELECT
          ((CURRENT_DATE + cs.time_preference::time) AT TIME ZONE
            CASE WHEN tz.name IS NOT NULL THEN cs.timezone ELSE 'UTC' END
          ) AT TIME ZONE 'UTC' AS utc_local
        FROM campaign_subscriptions cs
        LEFT JOIN pg_timezone_names tz ON tz.name = cs.timezone
        WHERE cs.status = 'active'
          AND cs.time_preference ~ '^[0-9]{1,2}:[0-9]{2}'
      ) sub
      GROUP BY bucket
      ORDER BY bucket
    `,
    sql`
      SELECT prayer_duration as duration, COUNT(*) as count
      FROM campaign_subscriptions
      WHERE status = 'active'
      GROUP BY prayer_duration
      ORDER BY prayer_duration
    `,
  ])

  const fillBuckets = (rows: any[]) => {
    const buckets = Array.from({ length: 288 }, (_, i) => ({ bucket: i, count: 0 }))
    for (const row of rows) {
      const bucket = Number(row.bucket)
      if (bucket >= 0 && bucket < 288) {
        buckets[bucket]!.count = Number(row.count)
      }
    }
    return buckets
  }

  return {
    byLanguage: languageRows.map((row: any) => ({
      language: row.language as string,
      count: Number(row.count),
    })),
    byTimeOfDayLocal: fillBuckets(timeLocalRows),
    byTimeOfDayUtc: fillBuckets(timeUtcRows),
    byDuration: durationRows.map((row: any) => ({
      duration: Number(row.duration),
      count: Number(row.count),
    })),
  }
})
