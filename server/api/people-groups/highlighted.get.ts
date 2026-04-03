/**
 * GET /api/people-groups/highlighted
 * Get featured people groups (highest population per WAGF region)
 * Supports translated labels via ?lang= query param
 */
import { getSql } from '../../database/db'
import { formatPeopleGroupForList } from '../../utils/app/people-group-formatter'
import { setCacheHeaders } from '../../utils/app/cors'
import { LANGUAGE_CODES } from '../../../config/languages'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  // Parse query params
  const query = getQuery(event)
  const lang = LANGUAGE_CODES.includes(query.lang as string) ? query.lang as string : 'en'
  const limit = Math.min(Math.max(parseInt(query.limit as string) || 6, 1), 20)

  const sql = getSql()

  // Query to get highest population people group per WAGF region
  // Excludes 'na' and 'oceania' regions
  // Must have an image
  const peopleGroups = await sql`
    WITH commitment_counts AS (
      SELECT people_group_id, COUNT(*) as people_committed
      FROM campaign_subscriptions
      WHERE status = 'active'
      GROUP BY people_group_id
    ),
    ranked AS (
      SELECT
        pg.*,
        pg.people_praying as total_people_praying,
        (pg.metadata::jsonb)->>'doxa_wagf_region' as wagf_region,
        COALESCE(cc.people_committed, 0)::INTEGER as people_committed,
        ROW_NUMBER() OVER (
          PARTITION BY (pg.metadata::jsonb)->>'doxa_wagf_region'
          ORDER BY COALESCE(cc.people_committed, 0) ASC, pg.population DESC NULLS LAST
        ) as rn
      FROM people_groups pg
      LEFT JOIN commitment_counts cc ON cc.people_group_id = pg.id
      WHERE pg.image_url IS NOT NULL
        AND pg.status != 'archived'
        AND (pg.metadata::jsonb)->>'doxa_wagf_region' IS NOT NULL
        AND (pg.metadata::jsonb)->>'doxa_wagf_region' NOT IN ('na', 'oceania')
    )
    SELECT * FROM ranked
    WHERE rn = 1
    ORDER BY people_committed ASC, population DESC NULLS LAST
    LIMIT ${limit}
  ` as any[]

  // Format the response
  const posts = peopleGroups.map(pg => formatPeopleGroupForList(pg, lang))

  return {
    posts,
    total: posts.length
  }
})
