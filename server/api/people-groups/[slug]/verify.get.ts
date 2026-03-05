/**
 * GET /api/people-groups/:slug/verify
 * Verify email address for people group subscription
 */
import { peopleGroupService } from '#server/database/people-groups'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { subscriberService } from '#server/database/subscribers'
import { sendWelcomeEmail } from '#server/utils/welcome-email'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const query = getQuery(event)
  const token = query.token as string

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'People group slug is required'
    })
  }

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token is required'
    })
  }

  // Verify the people group exists
  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Verify the token (now at contact method level)
  const result = await contactMethodService.verifyByToken(token)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: result.error || 'Verification failed'
    })
  }

  // Set initial next reminder for all email subscriptions of this subscriber
  let subscriber = null
  if (result.contactMethod) {
    await peopleGroupSubscriptionService.setNextRemindersForSubscriber(result.contactMethod.subscriber_id)
    subscriber = await subscriberService.getSubscriberById(result.contactMethod.subscriber_id)

    // Send welcome email (only if this was a new verification, not already verified)
    if (result.error !== 'Already verified' && subscriber) {
      const subscriptions = await peopleGroupSubscriptionService.getAllBySubscriberAndPeopleGroup(
        result.contactMethod.subscriber_id,
        peopleGroup.id
      )
      const latestActive = subscriptions.filter(s => s.status === 'active').pop()

      sendWelcomeEmail(
        result.contactMethod.value,
        subscriber.name,
        peopleGroup.name,
        slug,
        subscriber.profile_id,
        subscriber.preferred_language || 'en',
        subscriber.tracking_id,
        latestActive?.time_preference
      ).catch(err => console.error('Failed to send welcome email:', err))
    }
  }

  return {
    message: 'Email verified successfully',
    people_group_name: peopleGroup.name,
    people_group_slug: slug,
    tracking_id: subscriber?.tracking_id,
    already_verified: result.error === 'Already verified'
  }
})
