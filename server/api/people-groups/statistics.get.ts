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
        COUNT(*) as total_active,
        COUNT(*) FILTER (WHERE people_praying > 0) as total_with_prayer,
        COUNT(*) FILTER (WHERE engagement_status = 'engaged') as total_engaged,
        COUNT(*) FILTER (WHERE engagement_status IS DISTINCT FROM 'engaged') as total_unengaged
      FROM people_groups
      WHERE status != 'archived'
    `.then(rows => rows[0] as { total_active: string | number; total_with_prayer: string | number; total_engaged: string | number; total_unengaged: string | number }),
    sql`
      SELECT COUNT(DISTINCT a.people_group_id) as count
      FROM people_group_adoptions a
      JOIN people_groups pg ON pg.id = a.people_group_id
      WHERE a.status = 'active' AND pg.status != 'archived'
    `.then(rows => rows[0] as { count: string | number }),
    peopleGroupSubscriptionService.getGlobalCommitmentStats()
  ])

  return {
    total: Number(result.total_active),
    total_with_prayer: Number(result.total_with_prayer),
    total_engaged: Number(result.total_engaged),
    total_unengaged: Number(result.total_unengaged),
    total_with_full_prayer: commitmentStats.people_groups_with_full_commitment,
    total_with_prayer_committed: commitmentStats.people_groups_with_commitment,
    total_adopted: Number(adoptedResult.count),
    people_committed: commitmentStats.people_committed,
    committed_duration: commitmentStats.committed_duration
  }
})
