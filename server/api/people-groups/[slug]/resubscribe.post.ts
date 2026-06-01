/**
 * POST /api/people-groups/:slug/resubscribe
 * Re-subscribe to people group reminders after unsubscribing
 */
import { peopleGroupService } from '#server/database/people-groups'
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { trackEventInBackground } from '#server/utils/tracking'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const body = await readBody(event)
  const profileId = body.profile_id as string

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'People group slug is required'
    })
  }

  if (!profileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Profile ID is required'
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

  // Get the subscriber by profile ID
  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)

  if (!subscriber) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Subscription not found'
    })
  }

  // Get the subscription - by ID if provided, otherwise find first unsubscribed
  const subscriptionId = body.subscription_id as number | undefined
  let subscription

  if (subscriptionId) {
    subscription = await peopleGroupSubscriptionService.getById(subscriptionId)
    if (!subscription || subscription.subscriber_id !== subscriber.id || subscription.people_group_id !== peopleGroup.id) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Subscription not found'
      })
    }
  } else {
    // Legacy behavior: find first subscription for this people group
    subscription = await peopleGroupSubscriptionService.getBySubscriberAndPeopleGroup(
      subscriber.id,
      peopleGroup.id
    )
    if (!subscription) {
      throw createError({
        statusCode: 404,
        statusMessage: 'You are not subscribed to this people group'
      })
    }
  }

  // Check if already active or pending
  if (subscription.status === 'active' || subscription.status === 'pending') {
    trackEventInBackground(event, {
      eventType: 'subscriber_resubscribed',
      anonymousHash: subscriber.tracking_id,
      language: subscriber.preferred_language || null,
      metadata: {
        people_group_slug: slug,
        people_group_id: peopleGroup.id,
        subscription_id: subscription.id,
        already_active: true,
        status: subscription.status
      }
    })

    return {
      message: 'Subscription is already active',
      already_active: true,
      people_group_name: peopleGroup.name,
      people_group_slug: slug
    }
  }

  // Determine status based on email verification
  let resubscribeStatus: 'active' | 'pending' = 'active'
  if (subscription.delivery_method === 'email') {
    const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
    const emailContact = contacts.find(c => c.type === 'email')
    if (!emailContact?.verified) {
      resubscribeStatus = 'pending'
    }
  }

  // Reactivate the subscription
  const result = await peopleGroupSubscriptionService.resubscribe(subscription.id, resubscribeStatus)

  if (!result) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resubscribe'
    })
  }

  logCreate('subscribers', String(subscriber.id), event, {
    source: 'self_service',
    message: 'Resubscribed to',
    link_text: peopleGroup.name,
    link_url: `/admin/people-groups/${peopleGroup.id}`,
    form_values: {
      frequency: subscription.frequency,
      days_of_week: subscription.days_of_week,
      time_preference: subscription.time_preference,
      timezone: subscription.timezone
    }
  })

  trackEventInBackground(event, {
    eventType: 'subscriber_resubscribed',
    anonymousHash: subscriber.tracking_id,
    language: subscriber.preferred_language || null,
    metadata: {
      people_group_slug: slug,
      people_group_id: peopleGroup.id,
      subscription_id: subscription.id,
      already_active: false,
      status: resubscribeStatus
    }
  })

  return {
    message: 'Successfully resubscribed to prayer reminders',
    already_active: false,
    people_group_name: peopleGroup.name,
    people_group_slug: slug
  }
})
