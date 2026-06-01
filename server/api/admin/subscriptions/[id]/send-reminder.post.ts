import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupService } from '#server/database/people-groups'
import { sendPrayerReminderEmail } from '#server/utils/prayer-reminder-email'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

  const subscriptionId = getIntParam(event, 'id')

  try {
    // Get the subscription
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

    // Only email delivery method is supported for now
    if (subscription.delivery_method !== 'email') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Manual reminders are only supported for email subscriptions'
      })
    }

    // Get subscriber info
    const subscriber = await subscriberService.getSubscriberById(subscription.subscriber_id)

    if (!subscriber) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Subscriber not found'
      })
    }

    // Get email contact
    const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
    const emailContact = contacts.find(c => c.type === 'email')

    if (!emailContact?.value) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Subscriber does not have an email address'
      })
    }

    if (!emailContact.verified) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Subscriber email is not verified'
      })
    }

    // Get people group info
    const peopleGroup = await peopleGroupService.getPeopleGroupById(subscription.people_group_id)

    if (!peopleGroup) {
      throw createError({
        statusCode: 404,
        statusMessage: 'People group not found'
      })
    }

    // Send the reminder email
    const success = await sendPrayerReminderEmail({
      to: emailContact.value,
      subscriberName: subscriber.name,
      peopleGroupName: peopleGroup.name,
      peopleGroupSlug: peopleGroup.slug!,
      trackingId: subscriber.tracking_id,
      profileId: subscriber.profile_id!,
      subscriptionId: subscription.id,
      prayerDuration: subscription.prayer_duration || 10,
      prayerContent: null,
      locale: subscriber.preferred_language
    })

    if (!success) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to send reminder email'
      })
    }

    return {
      message: `Reminder email sent to ${emailContact.value}`
    }
  } catch (error) {
    handleApiError(error, 'Failed to send reminder')
  }
})
