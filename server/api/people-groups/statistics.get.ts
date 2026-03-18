/**
 * GET /api/people-groups/statistics
 * Get aggregate prayer/adoption statistics
 */
import { getSql } from '../../database/db'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { setCacheHeaders } from '../../utils/app/cors'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const sql = getSql()

  const [result, adoptedResult, commitmentStats] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE people_praying > 0) as total_with_prayer,
        COUNT(*) FILTER (WHERE people_praying >= 144) as total_with_full_prayer
      FROM people_groups
    `.then(rows => rows[0] as { total_with_prayer: string | number; total_with_full_prayer: string | number }),
    sql`
      SELECT COUNT(DISTINCT people_group_id) as count
      FROM people_group_adoptions
      WHERE status = 'active'
    `.then(rows => rows[0] as { count: string | number }),
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
