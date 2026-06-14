/**
 * GET /api/global/groups
 *
 * Thin people-group pool for the global.doxa.life prayer app. Returns one row
 * per active group (id, slug, name) so the sister app can run its own
 * weighted-random selection locally against its prayer counts.
 *
 * Authenticated with the shared FORM_API_KEY (same key the marketing site uses).
 */
import { getSql } from '#server/database/db'
import { requireFormApiKey } from '#server/utils/form-api-key'

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const sql = getSql()
  const groups = await sql`
    SELECT id, slug, name, latitude, longitude
    FROM people_groups
    WHERE status != 'archived' AND slug IS NOT NULL
    ORDER BY name
  ` as Array<{ id: number, slug: string, name: string, latitude: number | null, longitude: number | null }>

  return { groups, total: groups.length }
})
