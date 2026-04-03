import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()

  const [recordedRows, committedRows] = await Promise.all([
    sql`
      SELECT
        TO_CHAR(DATE(timestamp), 'YYYY-MM-DD') as date,
        COALESCE(ROUND(SUM(duration) / 60.0), 0) as minutes,
        COUNT(DISTINCT COALESCE(tracking_id, id::text)) as unique_sessions
      FROM prayer_activity
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `,
    sql`
      SELECT
        TO_CHAR(d.date, 'YYYY-MM-DD') as date,
        COALESCE(SUM(cs.prayer_duration), 0) as committed,
        COUNT(DISTINCT cs.subscriber_id) as unique_subscribers
      FROM generate_series(
        (NOW() - INTERVAL '29 days')::date,
        NOW()::date,
        '1 day'::interval
      ) as d(date)
      LEFT JOIN campaign_subscriptions cs
        ON cs.status = 'active'
        AND cs.created_at::date <= d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    `
  ])

  const recordedMap = new Map(recordedRows.map((r: any) => [r.date, r]))
  const committedMap = new Map(committedRows.map((r: any) => [r.date, { committed: Number(r.committed), unique_subscribers: Number(r.unique_subscribers) }]))
  const result = []
  const now = new Date()

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().split('T')[0]!
    const existing = recordedMap.get(key)
    const committedData = committedMap.get(key)
    result.push({
      date: key,
      minutes: Number(existing?.minutes ?? 0),
      unique_sessions: Number(existing?.unique_sessions ?? 0),
      committed: committedData?.committed ?? 0,
      unique_subscribers: committedData?.unique_subscribers ?? 0
    })
  }

  return result
})
