import { subscriberService } from '#server/database/subscribers'
import { roleService } from '#server/database/roles'
import { peopleGroupAccessService } from '#server/database/people-group-access'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'subscribers.view')
  const id = getIntParam(event, 'id')

  try {
    const scoped = await roleService.isPermissionScoped(user.userId, 'subscribers.view')
    let accessiblePeopleGroupIds: number[] | undefined

    if (scoped) {
      accessiblePeopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(user.userId)
      if (accessiblePeopleGroupIds.length === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
      }
    }

    const subscriber = await subscriberService.getSubscriberWithSubscriptions(id, accessiblePeopleGroupIds)

    if (!subscriber) {
      throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
    }

    if (scoped && accessiblePeopleGroupIds && subscriber.subscriptions.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
    }

    return { subscriber }
  } catch (error) {
    handleApiError(error, 'Failed to fetch subscriber')
  }
})
