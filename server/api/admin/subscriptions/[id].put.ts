import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { peopleGroupService } from '#server/database/people-groups'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

  const subscriptionId = getIntParam(event, 'id')

  const body = await readBody(event)
  const { frequency, time_preference, timezone, prayer_duration, status } = body

  try {
    const subscription = await peopleGroupSubscriptionService.getById(subscriptionId)

    if (!subscription) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Subscription not found'
      })
    }

    const hasAccess = await peopleGroupService.userCanAccessPeopleGroup(user.userId, subscription.people_group_id)
    if (!hasAccess) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have access to this subscription'
      })
    }

    const changes: Record<string, { from: any; to: any }> = {}
    const subscriptionUpdates: Record<string, any> = {}

    if (frequency !== undefined && frequency !== subscription.frequency) {
      changes.frequency = { from: subscription.frequency, to: frequency }
      subscriptionUpdates.frequency = frequency
    }
    if (time_preference !== undefined && time_preference !== subscription.time_preference) {
      changes.time_preference = { from: subscription.time_preference, to: time_preference }
      subscriptionUpdates.time_preference = time_preference
    }
    if (timezone !== undefined && timezone !== subscription.timezone) {
      changes.timezone = { from: subscription.timezone, to: timezone }
      subscriptionUpdates.timezone = timezone
    }
    if (prayer_duration !== undefined && prayer_duration !== subscription.prayer_duration) {
      changes.prayer_duration = { from: subscription.prayer_duration, to: prayer_duration }
      subscriptionUpdates.prayer_duration = prayer_duration
    }

    if (Object.keys(subscriptionUpdates).length > 0) {
      await peopleGroupSubscriptionService.updateSubscription(subscription.id, subscriptionUpdates)
    }

    if (status !== undefined && status !== subscription.status) {
      changes.status = { from: subscription.status, to: status }
      await peopleGroupSubscriptionService.updateStatus(subscription.id, status)
    }

    if (Object.keys(changes).length > 0) {
      logUpdate('campaign_subscriptions', String(subscriptionId), event, { changes })
    }

    const updatedSubscription = await peopleGroupSubscriptionService.getById(subscription.id)

    return { subscription: updatedSubscription }
  } catch (error) {
    handleApiError(error, 'Failed to update subscription')
  }
})
