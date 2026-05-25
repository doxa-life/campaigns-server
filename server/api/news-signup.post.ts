/**
 * POST /api/news-signup
 * News/newsletter signup — email + consents, no prayer schedule required.
 * Accepts the mobile app secret (X-App-Secret) or the form API key.
 * Sends a verification email (double opt-in). Optionally records people-group
 * update consent when a slug is supplied.
 */
import { peopleGroupService } from '#server/database/people-groups'
import { subscriberService } from '#server/database/subscribers'
import { requireAppSecretOrFormApiKey } from '#server/utils/anon-signup-secret'
import { applyEmailConsents } from '#server/utils/email-consents'
import { handleApiError } from '#server/utils/api-helpers'
import { trackEventInBackground, userHashFromEmail } from '#server/utils/tracking'
import countries from 'i18n-iso-countries'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  requireAppSecretOrFormApiKey(event)

  const body = await readBody<{
    name?: string
    email?: string
    consent_doxa_general?: boolean
    consent_people_group_updates?: boolean
    people_group_slug?: string
    language?: string
    country?: string
    tracking_id?: string
  }>(event)

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_REGEX.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  const name = body.name?.trim() || ''
  const language = body.language && ['en', 'es', 'fr'].includes(body.language) ? body.language : 'en'
  const rawCountry = body.country?.trim().toUpperCase() || null
  const country = rawCountry
    ? (rawCountry.length === 3 ? countries.alpha3ToAlpha2(rawCountry) : rawCountry) || null
    : null

  try {
    const { subscriber } = await subscriberService.findOrCreateForNews({
      email,
      name: name || email,
      country,
      language,
      trackingId: body.tracking_id
    })
    await subscriberService.addSource(subscriber.id, 'news')

    // Optional people-group update consent.
    let peopleGroupId: number | null = null
    if (body.people_group_slug && body.consent_people_group_updates) {
      const pg = await peopleGroupService.getPeopleGroupBySlug(body.people_group_slug)
      peopleGroupId = pg?.id ?? null
    }

    await applyEmailConsents({
      email,
      name: name || email,
      language,
      consentDoxaGeneral: body.consent_doxa_general,
      consentPeopleGroupUpdates: body.consent_people_group_updates,
      peopleGroupId
    })

    logCreate('subscribers', String(subscriber.id), event, {
      source: 'News signup',
      message: 'Signed up for news',
      form_values: {
        name,
        email,
        country,
        consent_doxa_general: body.consent_doxa_general ?? false,
        consent_people_group_updates: body.consent_people_group_updates ?? false,
        people_group_slug: body.people_group_slug ?? null
      }
    })

    trackEventInBackground(event, {
      eventType: 'news_signup',
      anonymousHash: subscriber.tracking_id,
      userHash: userHashFromEmail(email),
      language,
      metadata: {
        source: 'news_signup',
        consent_doxa_general: body.consent_doxa_general ?? false,
        consent_people_group_updates: body.consent_people_group_updates ?? false,
        people_group_slug: body.people_group_slug ?? null
      }
    })

    return {
      success: true,
      tracking_id: subscriber.tracking_id,
      profile_id: subscriber.profile_id
    }
  } catch (error) {
    handleApiError(error, 'Failed to process news signup')
  }
})
