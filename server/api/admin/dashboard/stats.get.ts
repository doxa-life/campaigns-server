import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const sql = getSql()

  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [engagementRow, totalRow, prayerRow, prayerTimeAllRow, prayerTime24hRow, prayerCommittedRow, dailyCommittedRow, adoptedRow, languageRows, prayerSignupsRow] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM people_groups WHERE engagement_status = 'engaged' OR (metadata::jsonb->>'imb_engagement_status') = 'engaged'`.then(rows => rows[0]),
    sql`SELECT COUNT(*) as count FROM people_groups`.then(rows => rows[0]),
    sql`SELECT COUNT(DISTINCT people_group_id) as count FROM campaign_subscriptions WHERE status = 'active'`.then(rows => rows[0]),
    sql`SELECT COALESCE(ROUND(SUM(duration) / 60.0), 0) as total FROM prayer_activity`.then(rows => rows[0]),
    sql`SELECT COALESCE(ROUND(SUM(duration) / 60.0), 0) as total FROM prayer_activity WHERE timestamp >= ${twentyFourHoursAgo}`.then(rows => rows[0]),
    sql`
      SELECT COALESCE(SUM(
        prayer_duration * GREATEST(0,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)
        )
      ), 0) as total
      FROM campaign_subscriptions
      WHERE status = 'active'
    `.then(rows => rows[0]),
    sql`SELECT COALESCE(SUM(prayer_duration), 0) as total FROM campaign_subscriptions WHERE status = 'active'`.then(rows => rows[0]),
    sql`SELECT COUNT(DISTINCT people_group_id) as count FROM people_group_adoptions WHERE status = 'active'`.then(rows => rows[0]),
    sql`
      SELECT COALESCE(s.preferred_language, 'en') as language, COUNT(DISTINCT cs.subscriber_id) as count
      FROM campaign_subscriptions cs
      JOIN subscribers s ON s.id = cs.subscriber_id
      WHERE cs.status = 'active'
      GROUP BY COALESCE(s.preferred_language, 'en')
      ORDER BY count DESC
    `,
    sql`SELECT COUNT(DISTINCT subscriber_id) as count FROM campaign_subscriptions WHERE status = 'active'`.then(rows => rows[0]),
  ])

  const total = Number(totalRow?.count ?? 0)
  const engaged = Number(engagementRow?.count ?? 0)
  const withPrayer = Number(prayerRow?.count ?? 0)
  const adopted = Number(adoptedRow?.count ?? 0)

  const signupsByLanguage = languageRows.map((row: any) => ({
    language: row.language as string,
    count: Number(row.count),
  }))

  return {
    engagement: { engaged, unengaged: total - engaged, total },
    adoption: { adopted, notAdopted: total - adopted, total },
    prayer: { withPrayer, withoutPrayer: total - withPrayer, total },
    prayerTime: {
      dailyCommitted: Number(dailyCommittedRow?.total ?? 0),
      committed: Math.round(Number(prayerCommittedRow?.total ?? 0)),
      recorded: Number(prayerTimeAllRow?.total ?? 0),
      last24h: Number(prayerTime24hRow?.total ?? 0),
    },
    signupsByLanguage,
    prayerSignups: Number(prayerSignupsRow?.count ?? 0),
  }
})
