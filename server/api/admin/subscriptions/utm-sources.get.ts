/**
 * GET /api/admin/subscriptions/utm-sources
 * Distinct signup sources (utm_source on the arriving link) with the number of
 * signups each produced, most common first. Feeds the subscriber filter builder.
 */
import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()
  const rows = await sql`
    SELECT utm_source, COUNT(*)::int AS signup_count
    FROM campaign_subscriptions
    WHERE utm_source IS NOT NULL
    GROUP BY utm_source
    ORDER BY signup_count DESC, utm_source ASC
  `

  return {
    sources: rows.map(row => ({
      utm_source: row.utm_source as string,
      signup_count: Number(row.signup_count)
    }))
  }
})
