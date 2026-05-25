/**
 * POST /api/people-groups/:slug/anon-signup
 * Anonymous prayer signup for the mobile app — no email/contact required.
 * Records the people group + reminder schedule and returns a stable identity.
 * Notifications are handled locally on-device; the server only records.
 */
import { peopleGroupService } from '#server/database/people-groups'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { isValidTimezone } from '#server/utils/next-reminder-calculator'
import { requireAnonSignupSecret } from '#server/utils/anon-signup-secret'
import { applyEmailConsents } from '#server/utils/email-consents'
import { handleApiError } from '#server/utils/api-helpers'
import { trackEventInBackground, userHashFromEmail } from '#server/utils/tracking'

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  requireAnonSignupSecret(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'People group slug is required' })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const body = await readBody(event)

  if (!body.frequency || !body.time) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: frequency, time' })
  }

  if (!TIME_REGEX.test(body.time)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid time. Must be HH:MM (24h)' })
  }

  const days_of_week = Array.isArray(body.days_of_week) ? body.days_of_week : undefined

  if (body.frequency === 'weekly' && (!days_of_week || days_of_week.length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Days of week are required for weekly frequency' })
  }

  const timezone = body.timezone && isValidTimezone(body.timezone) ? body.timezone : 'UTC'
  const language = body.language && ['en', 'es', 'fr'].includes(body.language) ? body.language : 'en'

  // Email is optional. When provided, it lets us dedup against an existing
  // (e.g. web) subscriber so the app subscription lands on the same record.
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null
  if (email && !EMAIL_REGEX.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null

  try {
    const { subscriber } = email
      ? await subscriberService.findOrCreateForNews({ email, name: name || email, language, trackingId: body.tracking_id })
      : await subscriberService.findOrCreateByTrackingId(body.tracking_id, language)
    await subscriberService.addSource(subscriber.id, 'anon-app')
    if (email) await subscriberService.addSource(subscriber.id, 'news')

    // Upsert the single app subscription for this (subscriber, people group).
    const existing = await peopleGroupSubscriptionService.getAllBySubscriberAndPeopleGroup(
      subscriber.id,
      peopleGroup.id
    )
    const appSub = existing.find(s => s.delivery_method === 'app')

    let subscription
    if (appSub) {
      await peopleGroupSubscriptionService.updateSubscription(appSub.id, {
        frequency: body.frequency,
        days_of_week,
        time_preference: body.time,
        timezone
      })
      if (appSub.status !== 'active') {
        await peopleGroupSubscriptionService.resubscribe(appSub.id)
      }
      subscription = (await peopleGroupSubscriptionService.getById(appSub.id))!
    } else {
      subscription = await peopleGroupSubscriptionService.createSubscription({
        people_group_id: peopleGroup.id,
        subscriber_id: subscriber.id,
        delivery_method: 'app',
        frequency: body.frequency,
        days_of_week,
        time_preference: body.time,
        timezone,
        status: 'active'
      })
    }

    if (email) {
      await applyEmailConsents({
        email,
        name: name || email,
        language,
        consentDoxaGeneral: body.consent_doxa_general,
        consentPeopleGroupUpdates: body.consent_people_group_updates,
        peopleGroupId: peopleGroup.id
      })
    }

    trackEventInBackground(event, {
      eventType: 'anon_signup',
      anonymousHash: subscriber.tracking_id,
      userHash: userHashFromEmail(email),
      language,
      metadata: {
        people_group_slug: slug,
        people_group_id: peopleGroup.id,
        subscription_id: subscription.id,
        frequency: body.frequency,
        delivery_method: 'app',
        source: 'mobile_app'
      }
    })

    logCreate('subscribers', String(subscriber.id), event, {
      source: 'Mobile app (anonymous)',
      message: 'Signed up to pray for',
      link_text: peopleGroup.name,
      link_url: `/admin/people-groups/${peopleGroup.id}`,
      form_values: {
        frequency: body.frequency,
        days_of_week,
        time: body.time,
        timezone,
        language
      }
    })

    return {
      tracking_id: subscriber.tracking_id,
      profile_id: subscriber.profile_id,
      subscription_id: subscription.id
    }
  } catch (error) {
    handleApiError(error, 'Failed to create anonymous signup')
  }
})
