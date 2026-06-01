/**
 * POST /api/collect
 *
 * First-party relay for browser analytics events. The browser POSTs here (same
 * host as the page), and we forward to Statinator server-side. This keeps the
 * Statinator API key off the client and makes the request invisible to
 * ad-blockers (which match on third-party hostnames, not eTLD+1).
 *
 * - Same-origin only (rejects cross-origin POSTs and missing-origin curls).
 * - event_type allowlist (caps abuse blast radius if the relay were misused).
 * - Body-size cap on metadata.
 * - pageview round-trips so the client can seed its heartbeat loop with the id.
 *   Other event types fire-and-forget via waitUntil.
 * - Never accepts a raw email from the browser; identity arrives pre-hashed.
 */
import { trackEventInBackground, trackEventReturningId } from '#server/utils/tracking'

const ALLOWED_EVENT_TYPES = new Set([
  'pageview',
  'share',
  'language_switched',
  'signup_cta_clicked',
  'prayer_content_viewed'
])

const MAX_METADATA_BYTES = 8 * 1024
const MAX_STR = 2048
const MAX_SHORT = 128

function sameOriginOrThrow(event: Parameters<typeof getHeader>[0]) {
  const host = (getHeader(event, 'host') || '').split(':')[0]
  const origin = getHeader(event, 'origin')
  const referer = getHeader(event, 'referer')
  let originHost = ''
  try {
    if (origin) originHost = new URL(origin).hostname
    else if (referer) originHost = new URL(referer).hostname
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  if (!originHost || originHost !== host) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

function cap(value: unknown, max: number): string | null {
  if (value == null) return null
  const s = String(value)
  return s ? s.slice(0, max) : null
}

export default defineEventHandler(async (event) => {
  sameOriginOrThrow(event)

  // Defensive body parse — sendBeacon and some keepalive paths can arrive with
  // text/plain; mirror the heartbeat endpoint's tolerance.
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
    referrer: cap(body.referrer, MAX_STR),
    screenSize: cap(body.screen_size, 32)
    // Intentionally no `email`: server-derived only, never browser-supplied.
  }

  // Pageviews need the inserted event id back so the client can run a heartbeat
  // loop keyed by it. Other types fire-and-forget (background) and return fast.
  if (eventType === 'pageview') {
    const result = await trackEventReturningId(event, input)
    setResponseStatus(event, 201)
    return result ?? { id: null }
  }

  trackEventInBackground(event, input)
  setResponseStatus(event, 202)
  return { ok: true }
})
