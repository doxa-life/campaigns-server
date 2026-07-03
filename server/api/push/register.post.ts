/**
 * POST /api/push/register
 *
 * Registers a mobile device's OneSignal push subscription against its
 * subscriber, so the (future) server-side sender can target it. Receive-only
 * today — this endpoint just persists the mapping.
 *
 * - App secret required (X-App-Secret), same deterrent as anon-signup / collect.
 * - Identity arrives as the device's tracking_id (always present) and optional
 *   profile_id. We resolve the subscriber preferring profile_id.
 * - A device that hasn't completed anon-signup yet has no subscriber row; that
 *   is a soft no-op (200) rather than an error, so the client never fails.
 */
import { requireAnonSignupSecret } from '#server/utils/anon-signup-secret'
import { subscriberService } from '#server/database/subscribers'
import { pushSubscriptionService } from '#server/database/push-subscriptions'

const MAX_SHORT = 128
const ALLOWED_PLATFORMS = new Set(['ios', 'android'])

function cap(value: unknown, max: number): string | null {
  if (value == null) return null
  const s = String(value)
  return s ? s.slice(0, max) : null
}

export default defineEventHandler(async (event) => {
  requireAnonSignupSecret(event)

  // Tolerate clients that send JSON as text/plain (mirror /api/collect/app).
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

  const subscriptionId = cap(body.onesignal_subscription_id, MAX_SHORT)
  if (!subscriptionId) {
    throw createError({ statusCode: 400, statusMessage: 'onesignal_subscription_id required' })
  }

  const trackingId = cap(body.tracking_id, MAX_SHORT)
  const profileId = cap(body.profile_id, MAX_SHORT)
  const platformRaw = cap(body.platform, 32)
  const platform = platformRaw && ALLOWED_PLATFORMS.has(platformRaw) ? platformRaw : null

  // Resolve the subscriber, preferring profile_id. external_id mirrors the id
  // the app used for OneSignal.login (profile_id, falling back to tracking_id).
  let subscriber = profileId ? await subscriberService.getSubscriberByProfileId(profileId) : null
  if (!subscriber && trackingId) {
    subscriber = await subscriberService.getSubscriberByTrackingId(trackingId)
  }

  if (!subscriber) {
    // Device hasn't completed anon-signup yet — nothing to attach to. Soft
    // no-op so the client doesn't treat it as a failure; it will retry once the
    // profile/subscription exists.
    setResponseStatus(event, 200)
    return { ok: true, registered: false }
  }

  await pushSubscriptionService.upsert({
    subscriberId: subscriber.id,
    oneSignalSubscriptionId: subscriptionId,
    externalId: profileId ?? trackingId ?? null,
    platform
  })

  setResponseStatus(event, 200)
  return { ok: true, registered: true }
})
