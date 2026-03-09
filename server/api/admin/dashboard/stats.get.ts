import { getDatabase } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = getDatabase()

  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [engagementRow, totalRow, prayerRow, prayerTimeAllRow, prayerTime24hRow, prayerCommittedRow, dailyCommittedRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM people_groups WHERE engagement_status = 'engaged' OR (metadata::jsonb->>'imb_engagement_status') = 'engaged'`).get(),
    db.prepare(`SELECT COUNT(*) as count FROM people_groups`).get(),
    db.prepare(`SELECT COUNT(DISTINCT people_group_id) as count FROM campaign_subscriptions WHERE status = 'active'`).get(),
    db.prepare(`SELECT COALESCE(ROUND(SUM(duration) / 60.0), 0) as total FROM prayer_activity`).get(),
    db.prepare(`SELECT COALESCE(ROUND(SUM(duration) / 60.0), 0) as total FROM prayer_activity WHERE timestamp >= ?`).get(twentyFourHoursAgo),
    db.prepare(`
      SELECT COALESCE(SUM(
        prayer_duration * GREATEST(0,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)
        )
      ), 0) as total
      FROM campaign_subscriptions
      WHERE status = 'active'
    `).get(),
    db.prepare(`SELECT COALESCE(SUM(prayer_duration), 0) as total FROM campaign_subscriptions WHERE status = 'active'`).get(),
  ])

  const total = Number(totalRow.count)
  const engaged = Number(engagementRow.count)
  const withPrayer = Number(prayerRow.count)

  return {
    engagement: { engaged, unengaged: total - engaged, total },
    adoption: { adopted: 0, notAdopted: total, total },
    prayer: { withPrayer, withoutPrayer: total - withPrayer, total },
    prayerTime: {
      dailyCommitted: Number(dailyCommittedRow?.total ?? 0),
      committed: Math.round(Number(prayerCommittedRow?.total ?? 0)),
      recorded: Number(prayerTimeAllRow?.total ?? 0),
      last24h: Number(prayerTime24hRow?.total ?? 0),
    },
  }
})
