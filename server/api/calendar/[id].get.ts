/**
 * GET /api/calendar/:id?pid=profileId
 * Generate and serve an ICS calendar file for a prayer reminder subscription
 */
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupService } from '#server/database/people-groups'
import { generateIcsContent } from '#server/utils/calendar-links'
import { t } from '#server/utils/translations'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const subscriptionId = parseInt(idParam || '', 10)
  const query = getQuery(event)
  const profileId = query.pid as string

  if (!subscriptionId || !profileId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing subscription ID or profile ID' })
  }

  const subscription = await peopleGroupSubscriptionService.getById(subscriptionId)
  if (!subscription) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }

  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber || subscriber.id !== subscription.subscriber_id) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupById(subscription.people_group_id)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const prayerUrl = `${baseUrl}/${peopleGroup.slug}/prayer?uid=${subscriber.tracking_id}`

  const locale = subscriber.preferred_language || 'en'

  const ics = generateIcsContent({
    title: t('calendar.eventTitle', locale, { campaign: peopleGroup.name }),
    description: t('calendar.eventDescription', locale, { duration: subscription.prayer_duration, campaign: peopleGroup.name }),
    frequency: subscription.frequency,
    daysOfWeek: subscription.days_of_week.length > 0 ? subscription.days_of_week : undefined,
    timePreference: subscription.time_preference,
    timezone: subscription.timezone,
    durationMinutes: subscription.prayer_duration,
    uid: `subscription-${subscription.id}@doxa.life`,
    url: prayerUrl
  })

  setResponseHeaders(event, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="prayer-reminder-${peopleGroup.name.toLowerCase().replace(/\s+/g, '-')}.ics"`
  })

  return ics
})
