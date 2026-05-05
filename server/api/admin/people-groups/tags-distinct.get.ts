import { getSql } from '#server/database/db'

export default defineEventHandler(async (event): Promise<{ tags: string[] }> => {
  await requirePermission(event, 'people_groups.view')

  const sql = getSql()
  const rows = await sql<{ tag: string }[]>`
    SELECT DISTINCT jsonb_array_elements_text(tags) AS tag
    FROM people_groups
    WHERE jsonb_typeof(tags) = 'array' AND jsonb_array_length(tags) > 0
    ORDER BY tag
  `
  return { tags: rows.map(r => r.tag) }
})
