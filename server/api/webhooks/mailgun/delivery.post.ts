import { messageService } from '../../../database/conversation-messages'
import { contactMethodService } from '../../../database/contact-methods'
import { validateMailgunWebhook, releaseSeenToken } from '../../../utils/mailgun-webhook'

/**
 * Mailgun delivery-event webhook. Two independent jobs:
 *  1. Address suppression — hard bounces / complaints / unsubscribes flag the
 *     recipient on contact_methods (suppressed_at) so every send path stops mailing
 *     it. Keyed on `recipient`, so it works for marketing/reminder sends we don't
 *     otherwise correlate. Temporary failures are ignored (Mailgun retries them).
 *  2. Outbound message state — updates the matching conversation message's delivery
 *     state by message-id.
 * Never touches `verified` — ownership is established solely by authenticated inbound
 * (see inbound webhook). Deliverability lives on the address/message, separate from consent.
 */

/**
 * Map a Mailgun event to a deliverability-suppression reason, or null when it must
 * not suppress. A `failed` event suppresses only on an explicit permanent severity —
 * a missing/unknown severity is treated as transient (don't permanently kill an
 * address on an ambiguous event). Legacy permanent_fail/rejected/bounced are always
 * permanent. Note: `unsubscribed` is NOT here — it's a marketing consent opt-out.
 */
function classifySuppression(eventType: string, severity: string): 'hard_bounce' | 'complaint' | null {
  if (eventType === 'complained') return 'complaint'
  if (eventType === 'failed') return severity === 'permanent' ? 'hard_bounce' : null
  if (eventType === 'permanent_fail' || eventType === 'rejected' || eventType === 'bounced') return 'hard_bounce'
  return null
}
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  const body = await readBody<any>(event).catch(() => null)
  if (!body) {
    throw createError({ statusCode: 400, statusMessage: 'Malformed payload' })
  }

  // Event webhooks nest the signature; tolerate both shapes.
  const sig = body.signature || { timestamp: body.timestamp, token: body.token, signature: body.signature }
  if (!process.env.VITEST) {
    const result = validateMailgunWebhook(
      { timestamp: sig?.timestamp || '', token: sig?.token || '', signature: sig?.signature || '' },
      config.mailgunWebhookSigningKey
    )
    if (!result.ok) {
      throw createError({ statusCode: 406, statusMessage: result.reason || 'Invalid signature' })
    }
  }

  const eventData = body['event-data'] || body
  const eventType = String(eventData.event || '').toLowerCase()
  const severity = String(eventData.severity || '').toLowerCase()
  const recipient = String(eventData.recipient || '')
  const reasonText = eventData['delivery-status']?.message || eventData.reason || eventData.severity || ''
  const messageId =
    eventData.message?.headers?.['message-id'] ||
    eventData['message-id'] ||
    body['Message-Id'] ||
    ''

  try {
    // 1. Address-level suppression — independent of any outbound message match.
    let suppressed = false
    const suppressReason = recipient ? classifySuppression(eventType, severity) : null
    if (suppressReason) {
      const row = await contactMethodService.suppressByEmail(recipient, suppressReason, reasonText || undefined)
      if (row) {
        suppressed = true
        // Surface on the contact's activity timeline when the address maps to a
        // subscriber; otherwise keep a registry-row audit entry.
        if (row.subscriber_id) {
          logUpdate('subscribers', String(row.subscriber_id), undefined, {
            badge: 'Email Suppressed', source: 'Mailgun', email: row.value, reason: suppressReason, detail: String(reasonText)
          })
        } else {
          logUpdate('contact_methods', String(row.id), undefined, { email: row.value, reason: suppressReason, detail: String(reasonText) })
        }
      }
    }

    // 1b. Mailgun-tracked unsubscribe — a consent signal, not a dead mailbox. Opt the
    // address out of marketing only; deliverability (transactional mail) is untouched.
    let unsubscribed = false
    if (recipient && eventType === 'unsubscribed') {
      const row = await contactMethodService.unsubscribeFromMarketing(recipient)
      if (row) {
        unsubscribed = true
        if (row.subscriber_id) {
          logUpdate('subscribers', String(row.subscriber_id), undefined, {
            badge: 'Unsubscribed', source: 'Mailgun', email: row.value
          })
        }
      }
    }

    // 2. Outbound message state — needs a message-id to correlate.
    if (!messageId) {
      // No message to correlate; acknowledge so Mailgun doesn't retry a useless event.
      const status = suppressed ? 'suppressed' : unsubscribed ? 'unsubscribed' : 'ignored'
      return { status, suppressed, unsubscribed }
    }

    if (eventType === 'delivered') {
      const updated = await messageService.markDeliveryByProviderId(messageId, 'delivered', {
        delivered_at: new Date().toISOString(),
      })
      if (updated) {
        logUpdate('conversation_messages', String(updated.id), undefined, { message: 'Delivered', delivery: 'delivered' })
      }
      return { status: 'delivered', matched: !!updated }
    }

    if (eventType === 'failed' || eventType === 'permanent_fail' || eventType === 'rejected') {
      const reason = eventData['delivery-status']?.message || eventData.reason || eventData.severity || 'Delivery failed'
      const updated = await messageService.markDeliveryByProviderId(messageId, 'failed', { failed_reason: String(reason) })
      if (updated) {
        logUpdate('conversation_messages', String(updated.id), undefined, { message: 'Delivery failed', delivery: 'failed', reason })
      }
      return { status: 'failed', matched: !!updated, suppressed }
    }

    const status = suppressed ? 'suppressed' : unsubscribed ? 'unsubscribed' : 'ignored'
    return { status, event: eventType, suppressed, unsubscribed }
  } catch (error: any) {
    // Release the seen token so Mailgun's retry (same token) isn't rejected as a replay.
    if (sig?.token) releaseSeenToken(sig.token)
    console.error('[DeliveryWebhook] Error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})
