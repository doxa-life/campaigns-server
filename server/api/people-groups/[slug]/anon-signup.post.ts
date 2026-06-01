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

  // Time is optional. When omitted, the signup records a commitment with no
  // specific reminder time — reminders are handled on-device for app signups.
  const time_preference = typeof body.time === 'string' && body.time.trim() ? body.time : undefined

  if (time_preference && !TIME_REGEX.test(time_preference)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid time. Must be HH:MM (24h)' })
  }

  // Frequency is optional too; default to a daily commitment when omitted.
  const frequency = typeof body.frequency === 'string' && body.frequency.trim() ? body.frequency : 'daily'

  const days_of_week = Array.isArray(body.days_of_week) ? body.days_of_week : undefined

  if (frequency === 'weekly' && (!days_of_week || days_of_week.length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Days of week are required for weekly frequency' })
  }

  // No-time signups count as a 5-minute daily commitment in the stats; timed
  // signups keep the existing default (undefined → 10 on create, preserved on update).
  const prayer_duration = time_preference ? undefined : 5

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
    // Only tag the 'news' source when at least one consent was actually
    // requested — an email supplied purely for dedup isn't a newsletter signup.
    if (email && (body.consent_doxa_general || body.consent_people_group_updates)) {
      await subscriberService.addSource(subscriber.id, 'news')
    }

    // Upsert the single app subscription for this (subscriber, people group).
    // A partial unique index on (subscriber_id, people_group_id) WHERE
    // delivery_method = 'app' enforces uniqueness; we retry on 23505 in case
    // a concurrent call (e.g. mobile double-tap) wins the race.
    const updateAppSub = async (id: number, status: string) => {
      await peopleGroupSubscriptionService.updateSubscription(id, {
        frequency,
        days_of_week,
        time_preference,
        timezone,
        prayer_duration
      })
      if (status !== 'active') {
        await peopleGroupSubscriptionService.resubscribe(id)
      }
      return (await peopleGroupSubscriptionService.getById(id))!
    }

    const existing = await peopleGroupSubscriptionService.getAllBySubscriberAndPeopleGroup(
      subscriber.id,
      peopleGroup.id
    )
    const appSub = existing.find(s => s.delivery_method === 'app')

    let subscription
    if (appSub) {
      subscription = await updateAppSub(appSub.id, appSub.status)
    } else {
      try {
        subscription = await peopleGroupSubscriptionService.createSubscription({
          people_group_id: peopleGroup.id,
          subscriber_id: subscriber.id,
          delivery_method: 'app',
          frequency,
          days_of_week,
          time_preference,
          timezone,
          prayer_duration,
          status: 'active'
        })
      } catch (err: any) {
        if (err?.code !== '23505') throw err
        const refreshed = await peopleGroupSubscriptionService.getAllBySubscriberAndPeopleGroup(
          subscriber.id,
          peopleGroup.id
        )
        const raced = refreshed.find(s => s.delivery_method === 'app')
        if (!raced) throw err
        subscription = await updateAppSub(raced.id, raced.status)
      }
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
        frequency,
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
        frequency,
        days_of_week,
        time: time_preference ?? null,
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
