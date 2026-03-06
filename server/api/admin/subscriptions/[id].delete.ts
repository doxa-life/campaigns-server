import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupService } from '#server/database/people-groups'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.delete')

  const subscriptionId = getIntParam(event, 'id')

  try {
    // Get subscription data before deletion for logging
    const subscription = await peopleGroupSubscriptionService.getById(subscriptionId)

    if (!subscription) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Subscription not found'
      })
    }

    // Verify user has access to this people group
    const hasAccess = await peopleGroupService.userCanAccessPeopleGroup(user.userId, subscription.people_group_id)
    if (!hasAccess) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have access to this subscription'
      })
    }

    // Get subscriber info
    const subscriber = await subscriberService.getSubscriberById(subscription.subscriber_id)
    const contacts = subscriber ? await contactMethodService.getSubscriberContactMethods(subscriber.id) : []
    const emailContact = contacts.find(c => c.type === 'email')
    const phoneContact = contacts.find(c => c.type === 'phone')

    // Delete the subscription
    await peopleGroupSubscriptionService.deleteSubscription(subscription.id)

    // Log the deletion with details
    logDelete('campaign_subscriptions', String(subscriptionId), event, {
      deletedRecord: {
        name: subscriber?.name,
        email: emailContact?.value,
        phone: phoneContact?.value,
        delivery_method: subscription.delivery_method,
        status: subscription.status,
        people_group_id: subscription.people_group_id
      }
    })

    // Note: We don't delete the subscriber here because they might have other subscriptions
    // The subscriber will remain even if all subscriptions are deleted

    return {
      success: true
    }
  } catch (error) {
    handleApiError(error, 'Failed to delete subscription')
  }
})
