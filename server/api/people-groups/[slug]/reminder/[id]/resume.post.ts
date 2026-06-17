/**
 * POST /api/people-groups/:slug/reminder/:id/resume
 * Un-mute a prayer-time reminder: re-enable the daily email for a subscription
 * that was muted (reminders_paused) but kept active. For a reminder that was fully
 * paused (status 'inactive' / 'unsubscribed') use /resubscribe instead — that path
 * reactivates the commitment and honours email re-verification.
 */
import { peopleGroupService } from '#server/database/people-groups'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { trackEventInBackground } from '#server/utils/tracking'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const reminderId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const profileId = body.profile_id as string

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'People group slug is required' })
  }
  if (!reminderId) {
    throw createError({ statusCode: 400, statusMessage: 'Reminder ID is required' })
  }
  if (!profileId) {
    throw createError({ statusCode: 400, statusMessage: 'Profile ID is required' })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
  }

  const subscription = await peopleGroupSubscriptionService.getById(Number(reminderId))
  if (!subscription) {
    throw createError({ statusCode: 404, statusMessage: 'Reminder not found' })
  }
  if (subscription.subscriber_id !== subscriber.id || subscription.people_group_id !== peopleGroup.id) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to change this reminder' })
  }

  await peopleGroupSubscriptionService.resumeReminder(subscription.id)

  logCreate('subscribers', String(subscriber.id), event, {
    source: 'self_service',
    badge: 'Started Reminder',
    message: 'Started reminders for',
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
    eventType: 'reminder_resumed',
    anonymousHash: subscriber.tracking_id,
    language: subscriber.preferred_language || null,
    metadata: {
      people_group_slug: slug,
      people_group_id: peopleGroup.id,
      subscription_id: subscription.id
    }
  })

  return {
    success: true,
    people_group: { id: peopleGroup.id, title: peopleGroup.name, slug }
  }
})
