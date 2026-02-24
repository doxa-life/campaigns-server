/**
 * GET /api/people-groups/statistics
 * Get aggregate prayer/adoption statistics
 */
import { getDatabase } from '../../database/db'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { setCorsHeaders, setCacheHeaders } from '../../utils/app/cors'

export default defineEventHandler(async (event) => {
  // Set CORS and cache headers
  setCorsHeaders(event)
  setCacheHeaders(event)

  const db = getDatabase()

  // Query statistics using subqueries for accurate aggregation
  const stmt = db.prepare(`
    WITH people_group_prayer AS (
      SELECT
        pg.id,
        COALESCE(SUM(c.people_praying), 0) as total_praying
      FROM people_groups pg
      LEFT JOIN campaigns c ON c.dt_id = pg.dt_id
      GROUP BY pg.id
    )
    SELECT
      COUNT(*) FILTER (WHERE total_praying > 0) as total_with_prayer,
      COUNT(*) FILTER (WHERE total_praying >= 144) as total_with_full_prayer
    FROM people_group_prayer
  `)

  const result = await stmt.get() as { total_with_prayer: string | number; total_with_full_prayer: string | number }
  const commitmentStats = await peopleGroupSubscriptionService.getGlobalCommitmentStats()

  return {
    total_with_prayer: Number(result.total_with_prayer),
    total_with_full_prayer: Number(result.total_with_full_prayer),
    total_adopted: 0,
    people_committed: commitmentStats.people_committed,
    committed_duration: commitmentStats.committed_duration
  }
})
