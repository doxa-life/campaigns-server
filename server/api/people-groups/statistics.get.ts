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

  const stmt = db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE people_praying > 0) as total_with_prayer,
      COUNT(*) FILTER (WHERE people_praying >= 144) as total_with_full_prayer
    FROM people_groups
  `)

  const adoptedStmt = db.prepare(`
    SELECT COUNT(DISTINCT people_group_id) as count
    FROM people_group_adoptions
    WHERE status = 'active'
  `)

  const [result, adoptedResult, commitmentStats] = await Promise.all([
    stmt.get() as Promise<{ total_with_prayer: string | number; total_with_full_prayer: string | number }>,
    adoptedStmt.get() as Promise<{ count: string | number }>,
    peopleGroupSubscriptionService.getGlobalCommitmentStats()
  ])

  return {
    total_with_prayer: Number(result.total_with_prayer),
    total_with_full_prayer: Number(result.total_with_full_prayer),
    total_adopted: Number(adoptedResult.count),
    people_committed: commitmentStats.people_committed,
    committed_duration: commitmentStats.committed_duration
  }
})
