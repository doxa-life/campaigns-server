import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Mailgun webhook signature verification.
 *
 * Mailgun signs every webhook with HMAC-SHA256 over `timestamp + token` using the
 * account's webhook signing key. Inbound routes post these as top-level form fields;
 * event webhooks (delivery) nest them under `signature`.
 */

export interface MailgunSignature {
  timestamp: string
  token: string
  signature: string
}

const MAX_AGE_SECONDS = 10 * 60

// Best-effort, per-instance replay defense. Combined with the staleness window and
// Message-Id idempotency this is sufficient at this volume; it is not shared across instances.
const seenTokens = new Map<string, number>()

function pruneSeenTokens(now: number) {
  if (seenTokens.size < 5000) return
  for (const [token, ts] of seenTokens) {
    if (now - ts > MAX_AGE_SECONDS * 1000) seenTokens.delete(token)
  }
}

export function verifyMailgunSignature(sig: MailgunSignature, signingKey: string): boolean {
  if (!signingKey || !sig?.signature || !sig?.timestamp || !sig?.token) return false

  const expected = createHmac('sha256', signingKey)
    .update(sig.timestamp + sig.token)
    .digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(sig.signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function isSignatureStale(timestamp: string): boolean {
  const ts = parseInt(timestamp, 10)
  if (Number.isNaN(ts)) return true
  const ageSeconds = Math.abs(Date.now() / 1000 - ts)
  return ageSeconds > MAX_AGE_SECONDS
}

export function isReplayedToken(token: string): boolean {
  const now = Date.now()
  pruneSeenTokens(now)
  if (seenTokens.has(token)) return true
  seenTokens.set(token, now)
  return false
}

/**
 * Release a token previously marked seen by `isReplayedToken`. Call this when a
 * webhook returns a retryable 5xx: Mailgun's retry resends the *same* token, so
 * leaving it recorded would cause the retry to be rejected as a replay (and the
 * message to be lost). A genuine replay attack only resends an already-*succeeded*
 * webhook, which we never release.
 */
export function releaseSeenToken(token: string): void {
  if (token) seenTokens.delete(token)
}

/**
 * Validate a Mailgun webhook signature, returning a reason on failure.
 * Skipped entirely in VITEST so tests can post synthetic payloads (set `skipInTest=false` to test the check).
 */
export function validateMailgunWebhook(sig: MailgunSignature, signingKey: string): { ok: boolean; reason?: string } {
  if (!verifyMailgunSignature(sig, signingKey)) return { ok: false, reason: 'Invalid signature' }
  if (isSignatureStale(sig.timestamp)) return { ok: false, reason: 'Stale signature' }
  if (isReplayedToken(sig.token)) return { ok: false, reason: 'Replayed token' }
  return { ok: true }
}
