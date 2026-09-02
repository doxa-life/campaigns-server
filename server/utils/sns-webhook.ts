import { createVerify, X509Certificate } from 'crypto'

/**
 * AWS SNS webhook message handling: signature verification, topic allow-listing,
 * replay defense, and subscription auto-confirmation.
 *
 * SNS signs each message with the private key of an AWS-hosted X.509 certificate
 * and posts JSON (Content-Type text/plain) to subscribed HTTPS endpoints. The
 * canonical string-to-sign is a fixed, ordered "key\nvalue\n" list that differs
 * between Notification and SubscriptionConfirmation messages.
 */

export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation'
  MessageId: string
  TopicArn: string
  Subject?: string
  Message: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL: string
  SubscribeURL?: string
  Token?: string
}

// SNS retries a failed delivery with the ORIGINAL Timestamp/Signature (unlike
// Mailgun, which re-signs each retry), and its retry policy can span hours — so
// the staleness window must be generous. True replays are further absorbed by
// the MessageId guard below and by idempotent event handlers.
const MAX_AGE_MS = 6 * 60 * 60 * 1000

// Best-effort, per-instance replay defense keyed on MessageId; not shared across instances.
const seenMessageIds = new Map<string, number>()

function pruneSeenMessageIds(now: number) {
  if (seenMessageIds.size < 5000) return
  for (const [id, ts] of seenMessageIds) {
    if (now - ts > MAX_AGE_MS) seenMessageIds.delete(id)
  }
}

export function isReplayedSnsMessage(messageId: string): boolean {
  const now = Date.now()
  pruneSeenMessageIds(now)
  if (seenMessageIds.has(messageId)) return true
  seenMessageIds.set(messageId, now)
  return false
}

/**
 * Release a MessageId previously marked seen. Call when a webhook returns a
 * retryable 5xx: SNS retries with the SAME MessageId, so leaving it recorded
 * would reject the retry as a replay and lose the event.
 */
export function releaseSeenSnsMessage(messageId: string): void {
  if (messageId) seenMessageIds.delete(messageId)
}

/** The signing cert must be an AWS SNS-hosted HTTPS .pem URL. */
export function isValidSigningCertUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(parsed.hostname) &&
      parsed.pathname.endsWith('.pem')
    )
  } catch {
    return false
  }
}

const certCache = new Map<string, string>()

async function fetchSigningCert(url: string): Promise<string> {
  const cached = certCache.get(url)
  if (cached) return cached

  // Manually-cleared AbortController (AbortSignal.timeout leaks under Bun).
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`Signing cert fetch failed: ${res.status}`)
    const pem = await res.text()
    certCache.set(url, pem)
    return pem
  } finally {
    clearTimeout(timeout)
  }
}

function buildStringToSign(msg: SnsMessage): string {
  const keys =
    msg.Type === 'Notification'
      ? (['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const)
      : (['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const)

  let out = ''
  for (const key of keys) {
    const value = (msg as unknown as Record<string, unknown>)[key]
    if (value === undefined || value === null) continue
    out += `${key}\n${value}\n`
  }
  return out
}

export async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  if (!msg?.Signature || !msg.SigningCertURL || !msg.Timestamp) return false
  if (!isValidSigningCertUrl(msg.SigningCertURL)) return false

  const age = Math.abs(Date.now() - Date.parse(msg.Timestamp))
  if (Number.isNaN(age) || age > MAX_AGE_MS) return false

  const algorithm = msg.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1'
  const pem = await fetchSigningCert(msg.SigningCertURL)
  const publicKey = new X509Certificate(pem).publicKey
  const verifier = createVerify(algorithm)
  verifier.update(buildStringToSign(msg), 'utf8')
  return verifier.verify(publicKey, msg.Signature, 'base64')
}

function getAllowedTopicArns(): string[] {
  const config = useRuntimeConfig()
  const raw = config.snsAllowedTopicArns || process.env.SNS_ALLOWED_TOPIC_ARNS || ''
  return String(raw)
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean)
}

/**
 * Verify an SNS message end-to-end: signature, staleness, topic allow-list, replay.
 * Returns a failure reason instead of throwing so handlers control the response code.
 */
export async function validateSnsMessage(msg: SnsMessage): Promise<{ ok: boolean; reason?: string }> {
  const allowed = getAllowedTopicArns()
  if (allowed.length && !allowed.includes(msg.TopicArn)) return { ok: false, reason: 'Unexpected topic' }

  let verified = false
  try {
    verified = await verifySnsSignature(msg)
  } catch (error: any) {
    console.error('[SNS] Signature verification error:', error?.message || error)
    return { ok: false, reason: 'Verification error' }
  }
  if (!verified) return { ok: false, reason: 'Invalid signature' }

  if (isReplayedSnsMessage(msg.MessageId)) return { ok: false, reason: 'Replayed message' }
  return { ok: true }
}

/**
 * Confirm an SNS subscription by fetching its SubscribeURL (only ever an AWS SNS
 * HTTPS URL). Called after the message itself has been verified.
 */
export async function confirmSnsSubscription(msg: SnsMessage): Promise<boolean> {
  const url = msg.SubscribeURL || ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(parsed.hostname)) {
      return false
    }
  } catch {
    return false
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok
  } finally {
    clearTimeout(timeout)
  }
}

/** Parse an SNS webhook body (posted as text/plain JSON). */
export function parseSnsMessage(rawBody: string | undefined): SnsMessage | null {
  if (!rawBody) return null
  try {
    const parsed = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || !parsed.Type || !parsed.MessageId) return null
    return parsed as SnsMessage
  } catch {
    return null
  }
}
