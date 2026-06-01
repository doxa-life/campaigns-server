import { groupService } from '../../../database/groups'
import { roleService } from '../../../database/roles'
import { peopleGroupAccessService } from '../../../database/people-group-access'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'groups.view')

  const query = getQuery(event)
  const search = query.search as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const offset = query.offset ? parseInt(query.offset as string) : undefined

  const scoped = await roleService.isPermissionScoped(user.userId, 'groups.view')

  if (scoped) {
    const accessiblePeopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(user.userId)
    if (accessiblePeopleGroupIds.length === 0) {
      return { groups: [], total: 0 }
    }
    const [groups, total] = await Promise.all([
      groupService.getAll({ search, limit, offset, peopleGroupIds: accessiblePeopleGroupIds }),
      groupService.count(search, accessiblePeopleGroupIds)
    ])
    return { groups, total }
  }

  const [groups, total] = await Promise.all([
    groupService.getAll({ search, limit, offset }),
    groupService.count(search)
  ])

  return { groups, total }
})
