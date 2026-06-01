import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()

  const [subscribedRows, unsubscribedRows] = await Promise.all([
    sql`
      SELECT
        TO_CHAR(d.date, 'YYYY-MM-DD') as date,
        COUNT(DISTINCT cs.subscriber_id) as subscribed
      FROM generate_series(
        (NOW() - INTERVAL '29 days')::date,
        NOW()::date,
        '1 day'::interval
      ) as d(date)
      LEFT JOIN campaign_subscriptions cs
        ON cs.created_at::date = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    `,
    sql`
      SELECT
        TO_CHAR(d.date, 'YYYY-MM-DD') as date,
        COUNT(DISTINCT cs.subscriber_id) as unsubscribed
      FROM generate_series(
        (NOW() - INTERVAL '29 days')::date,
        NOW()::date,
        '1 day'::interval
      ) as d(date)
      LEFT JOIN campaign_subscriptions cs
        ON cs.status = 'unsubscribed'
        AND cs.updated_at::date = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    `
  ])

  const subscribedMap = new Map(subscribedRows.map((r: any) => [r.date, Number(r.subscribed)]))
  const unsubscribedMap = new Map(unsubscribedRows.map((r: any) => [r.date, Number(r.unsubscribed)]))
  const result = []
  const now = new Date()

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().split('T')[0]!
    result.push({
      date: key,
      subscribed: subscribedMap.get(key) ?? 0,
      unsubscribed: unsubscribedMap.get(key) ?? 0,
    })
  }

  return result
})
