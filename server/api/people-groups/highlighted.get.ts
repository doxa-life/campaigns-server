/**
 * GET /api/people-groups/highlighted
 * Get featured people groups (highest population per WAGF region)
 * Supports translated labels via ?lang= query param
 */
import { getDatabase } from '../../database/db'
import { formatPeopleGroupForList } from '../../utils/app/people-group-formatter'
import { setCorsHeaders, setCacheHeaders } from '../../utils/app/cors'
import { LANGUAGE_CODES } from '../../../config/languages'

export default defineEventHandler(async (event) => {
  // Set CORS and cache headers
  setCorsHeaders(event)
  setCacheHeaders(event)

  // Parse query params
  const query = getQuery(event)
  const lang = LANGUAGE_CODES.includes(query.lang as string) ? query.lang as string : 'en'
  const limit = Math.min(Math.max(parseInt(query.limit as string) || 6, 1), 20)

  const db = getDatabase()

  // Query to get highest population people group per WAGF region
  // Excludes 'na' and 'oceania' regions
  // Must have an image
  const stmt = db.prepare(`
    WITH ranked AS (
      SELECT
        pg.*,
        pg.people_praying as total_people_praying,
        (pg.metadata::jsonb)->>'doxa_wagf_region' as wagf_region,
        ROW_NUMBER() OVER (
          PARTITION BY (pg.metadata::jsonb)->>'doxa_wagf_region'
          ORDER BY pg.population DESC NULLS LAST
        ) as rn
      FROM people_groups pg
      WHERE pg.image_url IS NOT NULL
        AND (pg.metadata::jsonb)->>'doxa_wagf_region' IS NOT NULL
        AND (pg.metadata::jsonb)->>'doxa_wagf_region' NOT IN ('na', 'oceania')
    )
    SELECT * FROM ranked
    WHERE rn = 1
    ORDER BY population DESC NULLS LAST
    LIMIT ?
  `)

  const peopleGroups = await stmt.all(limit) as any[]

  // Format the response
  const posts = peopleGroups.map(pg => formatPeopleGroupForList(pg, lang))

  return {
    posts,
    total: posts.length
  }
})
