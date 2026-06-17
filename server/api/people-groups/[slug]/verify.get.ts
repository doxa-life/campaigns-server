/**
 * GET /api/people-groups/:slug/verify
 * Verify email address for people group subscription
 */
import { peopleGroupService } from '#server/database/people-groups'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupSubscriptionService, type PeopleGroupSubscription } from '#server/database/people-group-subscriptions'
import { subscriberService } from '#server/database/subscribers'
import { pendingAdoptionService } from '#server/database/pending-adoptions'
import { peopleGroupAdoptionService } from '#server/database/people-group-adoptions'
import { sendAdoptionWelcomeEmail } from '#server/utils/adoption-welcome-email'
import { generateGoogleCalendarUrl, getIcsDownloadUrl } from '#server/utils/calendar-links'
import { t, localePath } from '#server/utils/translations'
import { trackEventInBackground, userHashFromEmail } from '#server/utils/tracking'

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

  // Pending prayer subscriptions are activated (and their next reminders set) by
  // the `contact.verified` hook fired inside verifyByToken above. Here we load
  // the subscriber and finalize the signup: welcome email, calendar links, and
  // any cross-flow pending adoptions.
  let subscriber = null
  let latestActive: PeopleGroupSubscription | null = null
  if (result.contactMethod) {
    // A token-verified contact method is always subscriber-linked.
    const subscriberId = result.contactMethod.subscriber_id!
    subscriber = await subscriberService.getSubscriberById(subscriberId)

    // Log email verification
    if (!result.alreadyVerified && subscriber) {
      logUpdate('subscribers', String(subscriber.id), event, {
        source: 'Email Verification',
        message: `Email verified: ${result.contactMethod.value}`
      })
    }

    // Fetch subscriptions (needed for welcome email and response)
    const subscriptions = await peopleGroupSubscriptionService.getAllBySubscriberAndPeopleGroup(
      subscriberId,
      peopleGroup.id
    )
    latestActive = subscriptions.filter(s => s.status === 'active').pop() ?? null

    // Welcome emails for the newly-activated prayer subscriptions are sent by the
    // `contact.verified` hook (one per group), so they're not sent here.

    // Cross-flow: activate any pending adoptions for this contact method
    const pendingAdoptions = await pendingAdoptionService.getByContactMethodId(result.contactMethod.id)

    // Compute remaining count once (only needed for welcome emails on new verifications)
    const remainingCount = !result.alreadyVerified && pendingAdoptions.length > 0
      ? await peopleGroupService.getRemainingUnadoptedCount()
      : 0

    for (const pending of pendingAdoptions) {
      const formData = typeof pending.form_data === 'string'
        ? JSON.parse(pending.form_data)
        : pending.form_data

      try {
        await peopleGroupAdoptionService.create({
          people_group_id: pending.people_group_id,
          group_id: pending.group_id,
          status: 'active',
          show_publicly: formData.show_publicly ?? false
        })
      } catch (err: any) {
        if (err.code !== '23505') throw err
      }

      if (!result.alreadyVerified) {
        const adoptionPeopleGroup = await peopleGroupService.getPeopleGroupById(pending.people_group_id)
        if (adoptionPeopleGroup) {
          sendAdoptionWelcomeEmail({
            to: result.contactMethod.value,
            firstName: formData.first_name || '',
            peopleGroupName: adoptionPeopleGroup.name,
            peopleGroupSlug: pending.people_group_slug,
            imageUrl: adoptionPeopleGroup.image_url,
            remainingGroupsCount: remainingCount,
            locale: formData.locale || 'en',
          }).catch(err => console.error('Failed to send adoption welcome email:', err))
        }
      }

      await pendingAdoptionService.delete(pending.id)
    }
  }

  // Generate calendar URLs server-side so we don't expose profile_id to the client
  let calendarUrls = null
  // A calendar event needs a concrete reminder time; no-time signups have none.
  if (latestActive && latestActive.time_preference && subscriber) {
    const timePreference = latestActive.time_preference
    const config = useRuntimeConfig()
    const baseUrl = config.public.siteUrl || 'http://localhost:3000'
    const locale = subscriber.preferred_language || 'en'
    const prayerPath = localePath(`/${slug}/prayer`, locale)
    const prayerUrl = `${baseUrl}${prayerPath}?uid=${subscriber.tracking_id}`

    const calendarOptions = {
      title: t('calendar.eventTitle', locale, { campaign: peopleGroup.name }),
      description: t('calendar.eventDescription', locale, { duration: latestActive.prayer_duration, campaign: peopleGroup.name }),
      frequency: latestActive.frequency,
      daysOfWeek: latestActive.days_of_week.length > 0 ? latestActive.days_of_week : undefined,
      timePreference,
      timezone: latestActive.timezone,
      durationMinutes: latestActive.prayer_duration,
      url: prayerUrl
    }

    calendarUrls = {
      google: generateGoogleCalendarUrl(calendarOptions),
      ics: getIcsDownloadUrl(latestActive.id, subscriber.profile_id, baseUrl)
    }
  }

  if (subscriber && result.contactMethod && !result.alreadyVerified) {
    trackEventInBackground(event, {
      eventType: 'subscriber_signup',
      anonymousHash: subscriber.tracking_id,
      userHash: userHashFromEmail(result.contactMethod.value),
      language: subscriber.preferred_language || 'en',
      metadata: {
        people_group_slug: slug,
        people_group_id: peopleGroup.id,
        frequency: latestActive?.frequency,
        delivery_method: latestActive?.delivery_method,
        prayer_duration: latestActive?.prayer_duration,
        status: 'active'
      }
    })
  }

  return {
    message: 'Email verified successfully',
    people_group_name: peopleGroup.name,
    people_group_slug: slug,
    tracking_id: subscriber?.tracking_id,
    already_verified: result.alreadyVerified === true,
    calendar_urls: calendarUrls
  }
})
