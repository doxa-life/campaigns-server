import { getDatabase } from '#server/database/db'

export interface ActivityStats {
  newSubscribers: number
  totalPrayerTime: number
  prayerCommitted: number
  groupsWithPrayer: number
  groupsWith144: number
  groupsAdopted: number
  groupsEngaged: number
}

export async function collectActivityStats(periodStart: Date, periodEnd: Date): Promise<ActivityStats> {
  const db = getDatabase()

  const startIso = periodStart.toISOString()
  const endIso = periodEnd.toISOString()

  const [
    subscribersRow,
    prayerTimeRow,
    prayerCommittedRow,
    groupsWithPrayerRow,
    groupsWith144Row,
    groupsEngagedRow
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM subscribers WHERE created_at >= ? AND created_at < ?`).get(startIso, endIso),
    db.prepare(`SELECT COALESCE(SUM(duration), 0) as total FROM prayer_activity WHERE timestamp >= ? AND timestamp < ?`).get(startIso, endIso),
    db.prepare(`
      SELECT COALESCE(SUM(
        prayer_duration * GREATEST(0,
          EXTRACT(EPOCH FROM (?::timestamp - GREATEST(?::timestamp, created_at))) / 86400
        )
      ), 0) as total
      FROM campaign_subscriptions
      WHERE status = 'active' AND created_at < ?
    `).get(endIso, startIso, endIso),
    db.prepare(`SELECT COUNT(DISTINCT people_group_id) as count FROM campaign_subscriptions WHERE status = 'active'`).get(),
    db.prepare(`SELECT COUNT(*) as count FROM (SELECT people_group_id FROM campaign_subscriptions WHERE status = 'active' GROUP BY people_group_id HAVING COUNT(*) >= 144) sub`).get(),
    db.prepare(`SELECT COUNT(*) as count FROM people_groups WHERE engagement_status = 'engaged' OR (metadata::jsonb->>'imb_engagement_status') = 'engaged'`).get()
  ])

  return {
    newSubscribers: Number(subscribersRow?.count ?? 0),
    totalPrayerTime: Number(prayerTimeRow?.total ?? 0),
    prayerCommitted: Math.round(Number(prayerCommittedRow?.total ?? 0)),
    groupsWithPrayer: Number(groupsWithPrayerRow?.count ?? 0),
    groupsWith144: Number(groupsWith144Row?.count ?? 0),
    groupsAdopted: 0,
    groupsEngaged: Number(groupsEngagedRow?.count ?? 0)
  }
}
