/**
 * POST /api/collect/app
 *
 * First-party analytics relay for the mobile app. Mirrors /api/collect, but the
 * trust boundary differs: a native app can't satisfy the browser relay's
 * same-origin check (it sends no matching Origin/Referer), so this sibling
 * authenticates with the bundled app secret (X-App-Secret) instead — the same
 * deterrent used by anon-signup.
 *
 * - App secret required (see requireAnonSignupSecret).
 * - event_type allowlist (caps abuse blast radius).
 * - Body-size cap on metadata.
 * - Identity arrives as the device's anonymous_hash (the tracking_id the app
 *   already holds from anon-signup). Never accepts a raw email from the client;
 *   any user_hash must arrive pre-hashed.
 * - All events fire-and-forget via waitUntil — the app never needs the id back
 *   (no engagement-heartbeat loop on the app side yet).
 */
import { requireAnonSignupSecret } from '#server/utils/anon-signup-secret'
import { trackEventInBackground } from '#server/utils/tracking'

const ALLOWED_EVENT_TYPES = new Set([
  'app_open',
  'language_switched'
])

const MAX_METADATA_BYTES = 8 * 1024
const MAX_STR = 2048
const MAX_SHORT = 128

function cap(value: unknown, max: number): string | null {
  if (value == null) return null
  const s = String(value)
  return s ? s.slice(0, max) : null
}

export default defineEventHandler(async (event) => {
  requireAnonSignupSecret(event)

  // Defensive body parse — mirror /api/collect's tolerance for clients that
  // send the JSON as text/plain.
  let raw: unknown = await readBody(event)
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
    }
  }
  if (!raw || typeof raw !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  }
  const body = raw as Record<string, unknown>

  const eventType = String(body.event_type || '')
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported event_type' })
  }

  // Cap metadata payload size. Drop it rather than failing on a too-large blob.
  let metadata = body.metadata as Record<string, unknown> | null | undefined
  if (metadata && typeof metadata === 'object') {
    try {
      if (JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
        throw createError({ statusCode: 413, statusMessage: 'metadata too large' })
      }
    } catch (err) {
      if ((err as { statusCode?: number })?.statusCode === 413) throw err
      metadata = null
    }
  } else {
    metadata = null
  }

  const input = {
    eventType,
    metadata: metadata ?? null,
    value: typeof body.value === 'number' && Number.isFinite(body.value) ? body.value : null,
    language: cap(body.language, 32),
    anonymousHash: cap(body.anonymous_hash, MAX_SHORT),
    userHash: cap(body.user_hash, MAX_SHORT),
    url: cap(body.url, MAX_STR),
    screenSize: cap(body.screen_size, 32)
    // Intentionally no `email`: server-derived only, never client-supplied.
  }

  trackEventInBackground(event, input)
  setResponseStatus(event, 202)
  return { ok: true }
})
