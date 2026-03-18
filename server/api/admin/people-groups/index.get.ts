import { peopleGroupService } from '../../../database/people-groups'
import { peopleGroupSubscriptionService } from '../../../database/people-group-subscriptions'
import { getSql } from '../../../database/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const search = query.search as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const offset = query.offset ? parseInt(query.offset as string) : undefined

  const [peopleGroups, total] = await Promise.all([
    peopleGroupService.getAllPeopleGroups({ search, limit, offset }),
    peopleGroupService.countPeopleGroups(search)
  ])

  const peopleGroupIds = peopleGroups.map(g => g.id)
  const commitmentStats = await peopleGroupSubscriptionService.getCommitmentStatsForPeopleGroups(peopleGroupIds)

  // Get adoption counts per people group
  const adoptionCounts = new Map<number, number>()
  if (peopleGroupIds.length > 0) {
    const sql = getSql()
    const rows = await sql`
      SELECT people_group_id, COUNT(*) as count
      FROM people_group_adoptions
      WHERE people_group_id IN ${sql(peopleGroupIds)} AND status IN ('active', 'pending')
      GROUP BY people_group_id
    ` as { people_group_id: number; count: number }[]
    for (const row of rows) {
      adoptionCounts.set(row.people_group_id, Number(row.count))
    }
  }

  // Parse metadata and descriptions for each group, attach stats
  const groupsWithParsedMetadata = peopleGroups.map(group => ({
    ...group,
    metadata: group.metadata ? JSON.parse(group.metadata) : {},
    descriptions: group.descriptions ? (typeof group.descriptions === 'string' ? JSON.parse(group.descriptions) : group.descriptions) : {},
    people_committed: commitmentStats.get(group.id)?.people_committed ?? 0,
    committed_duration: commitmentStats.get(group.id)?.committed_duration ?? 0,
    adoption_count: adoptionCounts.get(group.id) ?? 0
  }))

  return {
    peopleGroups: groupsWithParsedMetadata,
    total
  }
})
