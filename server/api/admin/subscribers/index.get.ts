import { subscriberService } from '#server/database/subscribers'
import { roleService } from '#server/database/roles'
import { peopleGroupAccessService } from '#server/database/people-group-access'
import { handleApiError } from '#server/utils/api-helpers'
import { decodeFilter } from '#shared/crm/filter-codec'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'subscribers.view')

  const query = getQuery(event)
  const filterParam = typeof query.filter === 'string' ? query.filter : undefined
  const search = typeof query.q === 'string' ? query.q : undefined
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const limitParam = typeof query.limit === 'string' ? parseInt(query.limit, 10) : undefined

  const filter = decodeFilter(filterParam)

  try {
    const scoped = await roleService.isPermissionScoped(user.userId, 'subscribers.view')
    let accessiblePeopleGroupIds: number[] | undefined

    if (scoped) {
      accessiblePeopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(user.userId)
      if (accessiblePeopleGroupIds.length === 0) {
        return { subscribers: [], nextCursor: null }
      }
    }

    const { items, nextCursor } = await subscriberService.getSubscribersPage({
      filter,
      search,
      cursor,
      limit: limitParam,
      accessiblePeopleGroupIds,
    })

    return {
      subscribers: items,
      nextCursor,
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch subscribers')
  }
})
