import { createPublicKey, createVerify } from 'crypto'

/**
 * SendGrid Signed Event Webhook verification.
 *
 * SendGrid signs each event POST with an ECDSA key: the signature (base64 DER)
 * arrives in X-Twilio-Email-Event-Webhook-Signature, the timestamp in
 * X-Twilio-Email-Event-Webhook-Timestamp, and the signed payload is
 * `timestamp + rawBody`. The verification public key (base64 DER SPKI) comes
 * from the SendGrid dashboard (Mail Settings → Signed Event Webhook).
 */

const MAX_AGE_SECONDS = 10 * 60

export function verifySendgridSignature(params: {
  publicKeyB64: string
  payload: string
  signature: string
  timestamp: string
}): { ok: boolean; reason?: string } {
  const { publicKeyB64, payload, signature, timestamp } = params
  if (!publicKeyB64) return { ok: false, reason: 'Verification key not configured' }
  if (!signature || !timestamp) return { ok: false, reason: 'Missing signature headers' }

  const ts = Date.parse(timestamp)
  if (!Number.isNaN(ts) && Math.abs(Date.now() - ts) / 1000 > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'Stale signature' }
  }

  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    })
    const verifier = createVerify('SHA256')
    verifier.update(timestamp + payload, 'utf8')
    const ok = verifier.verify(publicKey, signature, 'base64')
    return ok ? { ok: true } : { ok: false, reason: 'Invalid signature' }
  } catch (error: any) {
    console.error('[SendgridWebhook] Verification error:', error?.message || error)
    return { ok: false, reason: 'Verification error' }
  }
}
