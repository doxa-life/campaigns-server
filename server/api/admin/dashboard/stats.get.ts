import { getDatabase } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = getDatabase()

  const [engagementRow, totalRow, prayerRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM people_groups WHERE engagement_status = 'engaged' OR (metadata::jsonb->>'imb_engagement_status') = 'engaged'`).get(),
    db.prepare(`SELECT COUNT(*) as count FROM people_groups`).get(),
    db.prepare(`SELECT COUNT(DISTINCT people_group_id) as count FROM campaign_subscriptions WHERE status = 'active'`).get(),
  ])

  const total = Number(totalRow.count)
  const engaged = Number(engagementRow.count)
  const withPrayer = Number(prayerRow.count)

  return {
    engagement: { engaged, unengaged: total - engaged, total },
    adoption: { adopted: 0, notAdopted: total, total },
    prayer: { withPrayer, withoutPrayer: total - withPrayer, total },
  }
})
