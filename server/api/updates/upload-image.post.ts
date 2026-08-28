import { uploadSuggestionImage } from '../../utils/app/suggestion-images'
import { checkRateLimit, logRateLimitExceeded } from '../../utils/rate-limit'
import { logEvent } from '../../utils/activity-logger'
import { handleApiError } from '../../utils/api-helpers'

const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 10

/**
 * POST /api/updates/upload-image
 * Public upload of a suggested people group picture. Stored in the private
 * bucket; only copied to the public bucket if the suggestion is applied.
 * Guarded by rate limit + magic-byte sniff + size cap (no Turnstile here —
 * tokens are single-use and the form submit consumes one).
 * Multipart form: `image` file.
 */
export default defineEventHandler(async (event) => {
  const userAgent = getHeader(event, 'user-agent') || undefined
  const ip = getHeader(event, 'cf-connecting-ip')
    || getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  const rateCheck = await checkRateLimit('PG_SUGGESTION_IMAGE', 'ip', ip, RATE_WINDOW_MS, RATE_MAX)
  if (!rateCheck.allowed) {
    logRateLimitExceeded(ip, '/api/updates/upload-image', userAgent)
    setResponseHeader(event, 'Retry-After', rateCheck.retryAfterSeconds!)
    throw createError({ statusCode: 429, statusMessage: 'Too many uploads. Please try again later.' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'image' && p.filename)
  if (!file || !file.data || file.data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No image file found' })
  }

  await logEvent({ eventType: 'PG_SUGGESTION_IMAGE', userAgent, metadata: { ip } })

  try {
    const { key } = await uploadSuggestionImage(file.data)
    return { key }
  } catch (error) {
    handleApiError(error, 'Failed to upload image')
  }
})
