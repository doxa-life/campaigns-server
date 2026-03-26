/**
 * GET /api/people-groups/:slug/verify
 * Verify email address for people group subscription
 */
import { peopleGroupService } from '#server/database/people-groups'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupSubscriptionService, type PeopleGroupSubscription } from '#server/database/people-group-subscriptions'
import { subscriberService } from '#server/database/subscribers'
import { sendWelcomeEmail } from '#server/utils/welcome-email'
import { pendingAdoptionService } from '#server/database/pending-adoptions'
import { peopleGroupAdoptionService } from '#server/database/people-group-adoptions'
import { sendAdoptionWelcomeEmail } from '#server/utils/adoption-welcome-email'
import { generateGoogleCalendarUrl, getIcsDownloadUrl } from '#server/utils/calendar-links'
import { t, localePath } from '#server/utils/translations'

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

  // Activate pending subscriptions and set reminders
  let subscriber = null
  let latestActive: PeopleGroupSubscription | null = null
  if (result.contactMethod) {
    await peopleGroupSubscriptionService.activatePendingSubscriptions(result.contactMethod.subscriber_id)
    await peopleGroupSubscriptionService.setNextRemindersForSubscriber(result.contactMethod.subscriber_id)
    subscriber = await subscriberService.getSubscriberById(result.contactMethod.subscriber_id)

    // Log email verification
    if (!result.alreadyVerified && subscriber) {
      logUpdate('subscribers', String(subscriber.id), event, {
        source: 'Email Verification',
        message: `Email verified: ${result.contactMethod.value}`
      })
    }

    // Fetch subscriptions (needed for welcome email and response)
    const subscriptions = await peopleGroupSubscriptionService.getAllBySubscriberAndPeopleGroup(
      result.contactMethod.subscriber_id,
      peopleGroup.id
    )
    latestActive = subscriptions.filter(s => s.status === 'active').pop() ?? null

    // Send welcome email (only if this was a new verification, not already verified)
    if (!result.alreadyVerified && subscriber) {
      sendWelcomeEmail(
        result.contactMethod.value,
        subscriber.name,
        peopleGroup.name,
        slug,
        subscriber.profile_id,
        subscriber.preferred_language || 'en',
        subscriber.tracking_id,
        latestActive?.time_preference,
        latestActive ? {
          subscriptionId: latestActive.id,
          frequency: latestActive.frequency,
          daysOfWeek: latestActive.days_of_week.length > 0 ? latestActive.days_of_week : undefined,
          timezone: latestActive.timezone,
          prayerDuration: latestActive.prayer_duration
        } : undefined
      ).catch(err => console.error('Failed to send welcome email:', err))
    }

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
  if (latestActive && subscriber) {
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
      timePreference: latestActive.time_preference,
      timezone: latestActive.timezone,
      durationMinutes: latestActive.prayer_duration,
      url: prayerUrl
    }

    calendarUrls = {
      google: generateGoogleCalendarUrl(calendarOptions),
      ics: getIcsDownloadUrl(latestActive.id, subscriber.profile_id, baseUrl)
    }
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
