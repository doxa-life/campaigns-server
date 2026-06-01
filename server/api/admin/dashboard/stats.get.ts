import { getSql } from '#server/database/db'
import { committedDailyMinutes } from '#server/database/sql-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()

  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [engagementRow, totalRow, prayerRow, prayerTimeAllRow, prayerTime24hRow, prayerCommittedRow, dailyCommittedRow, adoptedRow, languageRows, prayerSignupsRow] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM people_groups WHERE engagement_status = 'engaged' AND status != 'archived'`.then(rows => rows[0]),
    sql`SELECT COUNT(*) as count FROM people_groups WHERE status != 'archived'`.then(rows => rows[0]),
    sql`
      SELECT COUNT(DISTINCT cs.people_group_id) as count
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      WHERE cs.status = 'active' AND pg.status != 'archived'
    `.then(rows => rows[0]),
    sql`
      SELECT COALESCE(ROUND(SUM(pa.duration) / 60.0), 0) as total
      FROM prayer_activity pa
      JOIN people_groups pg ON pg.id = pa.people_group_id
      WHERE pg.status != 'archived'
    `.then(rows => rows[0]),
    sql`
      SELECT COALESCE(ROUND(SUM(pa.duration) / 60.0), 0) as total
      FROM prayer_activity pa
      JOIN people_groups pg ON pg.id = pa.people_group_id
      WHERE pg.status != 'archived' AND pa.timestamp >= ${twentyFourHoursAgo}
    `.then(rows => rows[0]),
    sql`
      SELECT COALESCE(SUM(
        (${committedDailyMinutes(sql)}) * GREATEST(0,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - cs.created_at)) / 86400)
        )
      ), 0) as total
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      WHERE cs.status = 'active' AND pg.status != 'archived'
    `.then(rows => rows[0]),
    sql`
      SELECT COALESCE(ROUND(SUM(${committedDailyMinutes(sql)}))::int, 0) as total
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      WHERE cs.status = 'active' AND pg.status != 'archived'
    `.then(rows => rows[0]),
    sql`
      SELECT COUNT(DISTINCT a.people_group_id) as count
      FROM people_group_adoptions a
      JOIN people_groups pg ON pg.id = a.people_group_id
      WHERE a.status = 'active' AND pg.status != 'archived'
    `.then(rows => rows[0]),
    sql`
      SELECT COALESCE(s.preferred_language, 'en') as language, COUNT(DISTINCT cs.subscriber_id) as count
      FROM campaign_subscriptions cs
      JOIN subscribers s ON s.id = cs.subscriber_id
      JOIN people_groups pg ON pg.id = cs.people_group_id
      WHERE cs.status = 'active' AND pg.status != 'archived'
      GROUP BY COALESCE(s.preferred_language, 'en')
      ORDER BY count DESC
    `,
    sql`
      SELECT COUNT(DISTINCT cs.subscriber_id) as count
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      WHERE cs.status = 'active' AND pg.status != 'archived'
    `.then(rows => rows[0]),
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
