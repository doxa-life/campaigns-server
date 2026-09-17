/**
 * Magic-link access to a glossary review pass.
 *
 * A pass token is the only credential a reviewer has, so it is checked on every
 * request rather than exchanged for a session. Writes are rate limited by
 * token: the link is unauthenticated and gets forwarded around, and 39 terms is
 * far more editing than anyone does in a burst.
 */

import type { H3Event } from 'h3'
import { getPassByToken, getLanguageById, type GlossaryLanguage, type GlossaryReviewPass } from '../database/glossary'
import { checkRateLimit, logRateLimitExceeded } from './rate-limit'
import { logEvent } from './activity-logger'

const WRITE_WINDOW_MS = 60 * 1000
const WRITE_MAX_PER_WINDOW = 120

export interface ReviewContext {
  pass: GlossaryReviewPass
  language: GlossaryLanguage
}

export async function requireReviewPass(event: H3Event): Promise<ReviewContext> {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid review link' })
  }

  const pass = await getPassByToken(token)
  if (!pass) {
    throw createError({ statusCode: 404, statusMessage: 'This review link is no longer valid' })
  }

  const language = await getLanguageById(pass.language_id)
  if (!language) {
    throw createError({ statusCode: 404, statusMessage: 'This review link is no longer valid' })
  }

  return { pass, language }
}

/** Allow a burst of edits from one link, then refuse further writes for a minute. */
export async function limitReviewWrites(event: H3Event, pass: GlossaryReviewPass): Promise<void> {
  const { allowed, retryAfterSeconds } = await checkRateLimit(
    'GLOSSARY_REVIEW_WRITE',
    'pass_id',
    pass.id,
    WRITE_WINDOW_MS,
    WRITE_MAX_PER_WINDOW
  )

  if (!allowed) {
    logRateLimitExceeded(pass.id, 'glossary-review', getHeader(event, 'user-agent'))
    throw createError({
      statusCode: 429,
      statusMessage: `Too many changes at once — try again in ${retryAfterSeconds ?? 60} seconds`
    })
  }

  logEvent({
    eventType: 'GLOSSARY_REVIEW_WRITE',
    userAgent: getHeader(event, 'user-agent'),
    metadata: { pass_id: pass.id, language_id: pass.language_id }
  })
}
