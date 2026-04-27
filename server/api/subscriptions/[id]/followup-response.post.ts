import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { followupTrackingService } from '#server/database/followup-tracking'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupService } from '#server/database/people-groups'
import { trackEventInBackground } from '#server/utils/tracking'

export default defineEventHandler(async (event) => {
  const subscriptionId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const query = getQuery(event)

  if (!subscriptionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Subscription ID is required'
    })
  }

  // Require profile_id for authentication
  const profileId = query.id as string
  if (!profileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Profile ID is required'
    })
  }

  const { response } = body

  const validResponses = ['committed', 'sometimes', 'not_praying']
  if (!response || !validResponses.includes(response)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid response. Must be one of: committed, sometimes, not_praying'
    })
  }

  // Get subscriber by profile_id first
  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied'
    })
  }

  // Get the subscription
  const subscription = await peopleGroupSubscriptionService.getSubscriptionWithFollowupDetails(
    parseInt(subscriptionId)
  )

  if (!subscription) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Subscription not found'
    })
  }

  // Verify the subscription belongs to this subscriber
  if (subscription.subscriber_id !== subscriber.id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied'
    })
  }

  // Get people group for slug
  const peopleGroup = await peopleGroupService.getPeopleGroupById(subscription.people_group_id)
  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Record the response
  const followupSentAt = subscription.last_followup_at
    ? new Date(subscription.last_followup_at)
    : new Date()

  await followupTrackingService.recordResponse(
    subscription.id,
    response as 'committed' | 'sometimes' | 'not_praying',
    followupSentAt
  )

  // Handle response based on type
  if (response === 'committed' || response === 'sometimes') {
    // Complete the follow-up cycle - increment followup_count, reset followup_reminder_count
    await peopleGroupSubscriptionService.completeFollowupCycle(subscription.id)
  } else if (response === 'not_praying') {
    // Mark subscription as inactive
    await peopleGroupSubscriptionService.updateStatus(subscription.id, 'inactive')
  }

  trackEventInBackground(event, {
    eventType: 'followup_response',
    anonymousHash: subscriber.tracking_id,
    language: subscriber.preferred_language || null,
    metadata: {
      people_group_slug: peopleGroup.slug,
      people_group_id: peopleGroup.id,
      subscription_id: subscription.id,
      response
    }
  })

  // Return success with profile_id and people_group_slug for the landing page
  return {
    success: true,
    message: getResponseMessage(response),
    profile_id: subscriber.profile_id,
    people_group_slug: peopleGroup.slug
  }
})

function getResponseMessage(response: string): string {
  switch (response) {
    case 'committed':
      return 'Thank you for your commitment to prayer!'
    case 'sometimes':
      return 'Thank you for your honesty. Consider adjusting your schedule if needed.'
    case 'not_praying':
      return 'Your subscription has been paused. You can reactivate it anytime.'
    default:
      return 'Response recorded.'
  }
}
