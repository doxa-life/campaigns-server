/**
 * POST /api/collect/heartbeat
 *
 * First-party relay for the engagement heartbeat. Browser posts here on a 30s
 * interval and on pagehide (via navigator.sendBeacon), keyed by the event id
 * returned from /api/collect (pageview). We forward to Statinator's
 * /api/heartbeat via waitUntil so we can respond fast — the page may be
 * unloading and sendBeacon won't wait for us.
 *
 * sendBeacon may arrive with content-type `text/plain` when a Blob isn't
 * explicitly tagged; parse the body defensively.
 */
import { forwardHeartbeat } from '#server/utils/tracking'

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

export default defineEventHandler(async (event) => {
  sameOriginOrThrow(event)

  let body: unknown = await readBody(event)
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
    }
  }
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  }

  const { event_id: eventId, value } = body as { event_id?: number | string; value?: number }
  if (eventId == null || typeof value !== 'number' || !Number.isFinite(value)) {
    throw createError({ statusCode: 400, statusMessage: 'event_id and value are required' })
  }

  // Clamp to a sensible upper bound. Same-origin is not a perfect trust
  // boundary (XSS, console fiddling, etc.) — without a cap a single beacon
  // could inflate the event's value column by arbitrary amounts.
  const MAX_ENGAGED_SECONDS = 2 * 60 * 60
  const clamped = Math.min(Math.max(0, value), MAX_ENGAGED_SECONDS)

  // Respond immediately; the upstream forward continues via waitUntil.
  const promise = forwardHeartbeat(event, { eventId, value: clamped })
  const waitUntil = (event as unknown as { waitUntil?: (promise: Promise<unknown>) => void }).waitUntil
  if (typeof waitUntil === 'function') {
    waitUntil.call(event, promise)
  } else {
    void promise
  }

  setResponseStatus(event, 202)
  return { ok: true }
})
