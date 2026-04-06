/**
 * GET /api/people-groups/list
 * List all people groups with summary data
 * Supports translated labels via ?lang= query param
 */
import { getSql } from '../../database/db'
import { formatPeopleGroup } from '../../utils/app/people-group-formatter'
import { setCacheHeaders } from '../../utils/app/cors'
import { LANGUAGE_CODES } from '../../../config/languages'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { peopleGroupAdoptionService } from '../../database/people-group-adoptions'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  // Parse query params
  const query = getQuery(event)
  const lang = LANGUAGE_CODES.includes(query.lang as string) ? query.lang as string : 'en'
  const fieldsParam = query.fields as string | undefined

  // Parse requested fields
  const requestedFields = fieldsParam === 'all'
    ? 'all' as const
    : fieldsParam
      ? fieldsParam.split(',').map(f => f.trim()).filter(Boolean)
      : null

  const sql = getSql()

  // Query all people groups with people_praying directly from people_groups table
  const peopleGroups = await sql`
    SELECT
      pg.*,
      COALESCE(pg.people_praying, 0)::INTEGER as total_people_praying
    FROM people_groups pg
    WHERE pg.status != 'archived'
    ORDER BY pg.name
  ` as any[]

  // Fetch commitment stats and adoption counts for all people groups
  const pgIds = peopleGroups.map((pg: any) => pg.id)
  const [commitmentStatsMap, adoptionCountsMap] = await Promise.all([
    peopleGroupSubscriptionService.getCommitmentStatsForPeopleGroups(pgIds),
    peopleGroupAdoptionService.getActiveCountsForPeopleGroups(pgIds)
  ])

  // Attach people_committed and adopted_by_churches to each record
  for (const pg of peopleGroups) {
    const stats = commitmentStatsMap.get(pg.id)
    pg.people_committed = stats?.people_committed || 0
    pg.adopted_by_churches = adoptionCountsMap.get(pg.id) || 0
  }

  // Format the response
  const posts = peopleGroups.map(pg =>
    formatPeopleGroup(pg, { fields: requestedFields || undefined, lang })
  )

  return {
    posts,
    total: posts.length
  }
})
