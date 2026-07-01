/**
 * POST /api/feedback
 * Public, same-origin feedback submission from the mobile app's in-browser form
 * (app/pages/feedback.vue). Unlike /api/contact it is NOT API-key-gated — a
 * browser page can't safely hold the key — so abuse is bounded by an IP rate
 * limit instead. Adds a feedback_type (compliment/suggestion/problem) and an
 * optional tracking_id that links the message to the app's existing anonymous
 * subscriber. The heavy lifting is shared with /api/contact via submitContactMessage.
 */
import { handleApiError } from '#server/utils/api-helpers'
import { submitContactMessage, type FeedbackType } from '../utils/submit-contact'
import { checkRateLimit, logRateLimitExceeded } from '../utils/rate-limit'
import { logEvent } from '../utils/activity-logger'
import { ENABLED_LANGUAGE_CODES } from '../../config/languages'
import countries from 'i18n-iso-countries'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FEEDBACK_TYPES: FeedbackType[] = ['compliment', 'suggestion', 'problem']

// Device diagnostics the app may attach. This is a public endpoint, so we accept
// only these keys and cap each value — never pass arbitrary client data through
// to the inbox.
const DEVICE_KEYS = ['platform', 'os_version', 'device_model', 'app_version', 'app_build', 'timezone']
const DEVICE_VALUE_MAX = 100

function sanitizeDevice(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  const src = input as Record<string, unknown>
  for (const key of DEVICE_KEYS) {
    const raw = src[key]
    if (typeof raw !== 'string') continue
    const value = raw.trim().slice(0, DEVICE_VALUE_MAX)
    if (value) out[key] = value
  }
  return out
}

// Max accepted feedback submissions per IP per hour.
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 10

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    name?: string
    email?: string
    message?: string
    country?: string
    consent_doxa_general?: boolean
    language?: string
    feedback_type?: string
    tracking_id?: string
    device?: Record<string, unknown>
  }>(event)

  const email = body.email?.trim().toLowerCase()
  const message = body.message?.trim()
  const name = body.name?.trim() || ''
  const language = body.language && ENABLED_LANGUAGE_CODES.includes(body.language) ? body.language : 'en'

  const feedbackType = FEEDBACK_TYPES.includes(body.feedback_type as FeedbackType)
    ? (body.feedback_type as FeedbackType)
    : null
  const trackingId = body.tracking_id && UUID_REGEX.test(body.tracking_id) ? body.tracking_id : null

  if (!email || !EMAIL_REGEX.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }
  if (!message) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required field: message' })
  }
  // This endpoint is specifically for feedback, so the type is required — without
  // it the submission would silently become a plain contact-form conversation.
  if (!feedbackType) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or missing feedback_type' })
  }

  const rawCountry = body.country?.trim().toUpperCase() || null
  let country: string | null = null
  if (rawCountry) {
    if (rawCountry.length === 3) country = countries.alpha3ToAlpha2(rawCountry) || null
    else if (rawCountry.length === 2 && countries.isValid(rawCountry)) country = rawCountry
  }

  // Rate limit by IP — the only identifier we can trust on an unauthenticated
  // endpoint. Counts the FEEDBACK_SUBMISSION events logged below; fails open if
  // the check itself errors (see checkRateLimit).
  const userAgent = getHeader(event, 'user-agent') || undefined
  const ip = getHeader(event, 'cf-connecting-ip')
    || getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  const rateCheck = await checkRateLimit('FEEDBACK_SUBMISSION', 'ip', ip, RATE_WINDOW_MS, RATE_MAX)
  if (!rateCheck.allowed) {
    logRateLimitExceeded(ip, '/api/feedback', userAgent)
    setResponseHeader(event, 'Retry-After', rateCheck.retryAfterSeconds!)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many feedback submissions. Please try again later.',
    })
  }
  // Record the attempt so the next request's rate check can count it.
  await logEvent({ eventType: 'FEEDBACK_SUBMISSION', userAgent, metadata: { ip } })

  try {
    await submitContactMessage(event, {
      name,
      email,
      message,
      country,
      language,
      consentDoxaGeneral: body.consent_doxa_general,
      trackingId,
      feedbackType,
      device: sanitizeDevice(body.device),
    })

    return { success: true }
  } catch (error: any) {
    handleApiError(error, 'Failed to process feedback', 500)
  }
})
