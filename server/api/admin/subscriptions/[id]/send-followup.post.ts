import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupService } from '#server/database/people-groups'
import { sendFollowupEmail } from '#server/utils/followup-email'
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

    // Only email delivery method is supported
    if (subscription.delivery_method !== 'email') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Follow-up emails are only supported for email subscriptions'
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

    // Parse days of week if present
    const daysOfWeek = subscription.days_of_week
      ? JSON.parse(subscription.days_of_week)
      : undefined

    // Send the follow-up email
    const success = await sendFollowupEmail({
      to: emailContact.value,
      subscriberName: subscriber.name,
      peopleGroupName: peopleGroup.name,
      peopleGroupSlug: peopleGroup.slug!,
      subscriptionId: subscription.id,
      profileId: subscriber.profile_id!,
      frequency: subscription.frequency,
      daysOfWeek,
      isReminder: false,
      locale: subscriber.preferred_language
    })

    if (!success) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to send follow-up email'
      })
    }

    // Mark that a follow-up was sent
    await peopleGroupSubscriptionService.markFollowupSent(subscription.id)

    return {
      message: `Follow-up email sent to ${emailContact.value}`
    }
  } catch (error) {
    handleApiError(error, 'Failed to send follow-up')
  }
})
