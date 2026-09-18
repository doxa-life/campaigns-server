import { requireFormApiKey } from '../utils/form-api-key'
import { handleApiError } from '#server/utils/api-helpers'
import { submitContactMessage, type FeedbackType } from '../utils/submit-contact'
import countries from 'i18n-iso-countries'

const FEEDBACK_TYPES: FeedbackType[] = ['compliment', 'suggestion', 'problem']

// Origin markers a key-holding caller may claim. The value lands on the
// conversation's `source` column and is rendered from `inbox.source.<value>`,
// so it is an allowlist rather than a free-text field — an unrecognised value
// falls back to the default derived from feedback_type.
const ALLOWED_SOURCES = ['doxa_life']

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody<{
    name?: string
    email: string
    message: string
    country?: string
    consent_doxa_general?: boolean
    language?: string
    feedback_type?: string
    source?: string
  }>(event)

  const language = body.language?.trim() || 'en'
  const name = body.name?.trim() || ''
  const email = body.email?.trim().toLowerCase()
  const message = body.message?.trim()
  const rawCountry = body.country?.trim().toUpperCase() || null
  const country = rawCountry
    ? (rawCountry.length === 3 ? countries.alpha3ToAlpha2(rawCountry) : rawCountry) || null
    : null

  // Optional: callers that ask the sender to categorise their message (the
  // doxa.life contact form does) get the feedback treatment — a `[Type]` subject
  // prefix and the matching inbox tag. Omitting it keeps the plain contact shape.
  const feedbackType = FEEDBACK_TYPES.includes(body.feedback_type as FeedbackType)
    ? (body.feedback_type as FeedbackType)
    : null
  const source = body.source && ALLOWED_SOURCES.includes(body.source) ? body.source : null

  if (!email || !message) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: email, message' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  try {
    await submitContactMessage(event, {
      name,
      email,
      message,
      country,
      language,
      consentDoxaGeneral: body.consent_doxa_general,
      feedbackType,
      source,
    })

    return { success: true }
  } catch (error: any) {
    handleApiError(error, 'Failed to process contact form', 500)
  }
})
