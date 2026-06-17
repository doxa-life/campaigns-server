/**
 * POST /api/people-groups/:slug/stop-all
 * "Not praying any more" for an entire people group: pause every still-active
 * prayer time the subscriber has for it (status 'inactive', reactivatable). Offered
 * on the stop-reminders page only when the person has more than one reminder for the
 * group; for a single reminder the per-time "stop praying" already covers it.
 */
import { peopleGroupService } from '#server/database/people-groups'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { trackEventInBackground } from '#server/utils/tracking'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const body = await readBody(event)
  const profileId = body.profile_id as string

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'People group slug is required' })
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

  const stoppedCount = await peopleGroupSubscriptionService.stopPrayerForPeopleGroup(
    subscriber.id,
    peopleGroup.id
  )

  if (stoppedCount > 0) {
    logCreate('subscribers', String(subscriber.id), event, {
      source: 'self_service',
      badge: 'Stopped Prayer',
      message: 'Stopped all prayer for',
      link_text: peopleGroup.name,
      link_url: `/admin/people-groups/${peopleGroup.id}`,
      form_values: {
        stopped_count: stoppedCount
      }
    })
  }

  trackEventInBackground(event, {
    eventType: 'prayer_paused_all',
    anonymousHash: subscriber.tracking_id,
    language: subscriber.preferred_language || null,
    metadata: {
      people_group_slug: slug,
      people_group_id: peopleGroup.id,
      stopped_count: stoppedCount
    }
  })

  return {
    success: true,
    stopped_count: stoppedCount,
    people_group: { id: peopleGroup.id, title: peopleGroup.name, slug }
  }
})
