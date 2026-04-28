import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()

  const rows = await sql`
    SELECT
      pg.id,
      pg.name,
      pg.slug,
      COUNT(cs.id)::int AS subscriber_count
    FROM people_groups pg
    LEFT JOIN campaign_subscriptions cs
      ON cs.people_group_id = pg.id
      AND cs.status = 'active'
    GROUP BY pg.id, pg.name, pg.slug
    ORDER BY subscriber_count DESC, pg.name ASC
  `

  return rows
})
