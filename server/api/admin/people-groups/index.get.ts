import { peopleGroupService } from '../../../database/people-groups'
import { peopleGroupSubscriptionService } from '../../../database/people-group-subscriptions'
import { roleService } from '../../../database/roles'
import { peopleGroupAccessService } from '../../../database/people-group-access'
import { getSql } from '../../../database/db'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.view')

  const query = getQuery(event)
  const search = query.search as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const offset = query.offset ? parseInt(query.offset as string) : undefined
  const includes = (query.include as string || '').split(',').filter(Boolean)
  const includeActivity = includes.includes('activity')

  const scoped = await roleService.isPermissionScoped(user.userId, 'people_groups.view')

  let peopleGroups
  let total

  if (scoped) {
    const accessibleIds = await peopleGroupAccessService.getUserPeopleGroups(user.userId)
    if (accessibleIds.length === 0) {
      return { peopleGroups: [], total: 0 }
    }
    ;[peopleGroups, total] = await Promise.all([
      peopleGroupService.getAllPeopleGroups({ search, limit, offset, ids: accessibleIds }),
      peopleGroupService.countPeopleGroups(search, accessibleIds)
    ])
  } else {
    ;[peopleGroups, total] = await Promise.all([
      peopleGroupService.getAllPeopleGroups({ search, limit, offset }),
      peopleGroupService.countPeopleGroups(search)
    ])
  }

  const peopleGroupIds = peopleGroups.map(g => g.id)
  const commitmentStats = await peopleGroupSubscriptionService.getCommitmentStatsForPeopleGroups(peopleGroupIds)

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

  const activityByRecord = new Map<string, any[]>()
  if (includeActivity && peopleGroupIds.length > 0) {
    const db = getSql()
    const activities = await db`
      SELECT al.id, al.timestamp, al.event_type, al.record_id, al.user_id, al.metadata, u.display_name as user_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.table_name = 'people_groups' AND al.record_id IN ${db(peopleGroupIds.map(String))}
      ORDER BY al.timestamp DESC
    `
    for (const a of activities) {
      const recordId = String(a.record_id)
      if (!activityByRecord.has(recordId)) activityByRecord.set(recordId, [])
      activityByRecord.get(recordId)!.push({
        id: a.id,
        timestamp: typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp,
        eventType: a.event_type,
        userId: a.user_id,
        userName: a.user_name,
        metadata: typeof a.metadata === 'string' ? JSON.parse(a.metadata) : a.metadata
      })
    }
  }

  const groupsWithParsedMetadata = peopleGroups.map(group => ({
    ...group,
    metadata: group.metadata || {},
    descriptions: group.descriptions || {},
    people_committed: commitmentStats.get(group.id)?.people_committed ?? 0,
    committed_duration: commitmentStats.get(group.id)?.committed_duration ?? 0,
    adoption_count: adoptionCounts.get(group.id) ?? 0,
    ...(includeActivity && { activity: activityByRecord.get(String(group.id)) || [] })
  }))

  return {
    peopleGroups: groupsWithParsedMetadata,
    total
  }
})
