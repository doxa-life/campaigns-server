/**
 * POST /api/people-groups/:slug/reminder/:id/stop
 * Stop a single prayer-time reminder. Two outcomes, chosen by the subscriber on
 * the stop-reminders page (or the manage page):
 *   - action 'mute': keep praying, just suppress the daily email (reminders_paused),
 *     subscription stays active so the monthly follow-up check-in still goes out.
 *   - action 'not_praying': stop the prayer commitment itself. The contact chose to
 *     stop, so the row becomes 'unsubscribed' (a deliberate opt-out, not reversed by
 *     background activity); no daily email and no follow-up. Resubscribe to resume.
 * POST (not DELETE) because the reminder row is never removed here — that keeps the
 * subscriber's history and lets them resume.
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
  const action = body.action as 'mute' | 'not_praying'

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'People group slug is required' })
  }
  if (!reminderId) {
    throw createError({ statusCode: 400, statusMessage: 'Reminder ID is required' })
  }
  if (!profileId) {
    throw createError({ statusCode: 400, statusMessage: 'Profile ID is required' })
  }
  if (action !== 'mute' && action !== 'not_praying') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid action. Must be one of: mute, not_praying' })
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

  const reminderDetails = {
    frequency: subscription.frequency,
    days_of_week: subscription.days_of_week,
    time_preference: subscription.time_preference,
    timezone: subscription.timezone
  }

  if (action === 'mute') {
    await peopleGroupSubscriptionService.muteReminder(subscription.id)
    logCreate('subscribers', String(subscriber.id), event, {
      source: 'self_service',
      badge: 'Muted Reminder',
      message: 'Muted reminders for',
      link_text: peopleGroup.name,
      link_url: `/admin/people-groups/${peopleGroup.id}`,
      form_values: reminderDetails
    })
  } else {
    await peopleGroupSubscriptionService.updateStatus(subscription.id, 'unsubscribed')
    logCreate('subscribers', String(subscriber.id), event, {
      source: 'self_service',
      badge: 'Stopped Prayer',
      message: 'Stopped prayer for',
      link_text: peopleGroup.name,
      link_url: `/admin/people-groups/${peopleGroup.id}`,
      form_values: reminderDetails
    })
  }

  trackEventInBackground(event, {
    eventType: action === 'mute' ? 'reminder_muted' : 'prayer_paused',
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
    action,
    people_group: { id: peopleGroup.id, title: peopleGroup.name, slug }
  }
})
