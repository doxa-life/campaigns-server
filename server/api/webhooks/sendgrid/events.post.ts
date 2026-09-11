import { messageService } from '../../../database/conversation-messages'
import { contactMethodService } from '../../../database/contact-methods'
import { verifySendgridSignature } from '../../../utils/sendgrid-webhook'

/**
 * SendGrid event webhook. Receives a JSON array of events per POST. Three
 * independent jobs, mirroring the Mailgun delivery webhook:
 *  1. Address suppression — hard bounces / spam reports flag the recipient on
 *     contact_methods (suppressed_at) so every send path stops mailing it.
 *     Blocks and dropped sends are transient/SendGrid-side and don't suppress.
 *  2. Marketing opt-out — an `unsubscribe` event turns marketing consents off
 *     without touching deliverability, so transactional mail keeps flowing.
 *  3. Outbound message state — updates the matching conversation message's
 *     delivery state by the sg_message_id / smtp-id.
 * Never touches `verified` — ownership is established solely by authenticated
 * inbound. The POST is authenticated via SendGrid's ECDSA Signed Event Webhook.
 */

interface SendgridEvent {
  email?: string
  event?: string
  type?: string // for bounce events: 'bounce' (hard) | 'blocked'
  reason?: string
  sg_message_id?: string
  'smtp-id'?: string
  timestamp?: number
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const rawBody = (await readRawBody(event, 'utf8').catch(() => undefined)) || ''

  // ECDSA signature validation. Skipped under VITEST so tests can post synthetic
  // batches; x-test-verify-sig opts a test back in to exercise it.
  if (!process.env.VITEST || getHeader(event, 'x-test-verify-sig') === '1') {
    const result = verifySendgridSignature({
      publicKeyB64: config.sendgridWebhookPublicKey || '',
      payload: rawBody,
      signature: getHeader(event, 'x-twilio-email-event-webhook-signature') || '',
      timestamp: getHeader(event, 'x-twilio-email-event-webhook-timestamp') || '',
    })
    if (!result.ok) {
      throw createError({ statusCode: 406, statusMessage: result.reason || 'Invalid signature' })
    }
  }

  let events: SendgridEvent[]
  try {
    const parsed = JSON.parse(rawBody)
    events = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Malformed payload' })
  }

  let suppressed = 0
  let unsubscribed = 0
  let matched = 0

  try {
    for (const evt of events) {
      const kind = String(evt.event || '').toLowerCase()
      const recipient = String(evt.email || '')
      // sg_message_id is the send's X-Message-Id plus a .filter… suffix.
      const sgMessageId = String(evt.sg_message_id || '').split('.')[0] || ''
      const smtpId = String(evt['smtp-id'] || '')

      if (kind === 'bounce') {
        const hard = String(evt.type || '').toLowerCase() !== 'blocked'
        if (recipient && hard) {
          const row = await contactMethodService.suppressByEmail(recipient, 'hard_bounce', evt.reason || undefined)
          if (row) {
            suppressed++
            if (row.subscriber_id) {
              logUpdate('subscribers', String(row.subscriber_id), undefined, {
                badge: 'Email Suppressed', source: 'SendGrid', email: row.value, reason: 'hard_bounce', detail: String(evt.reason || '')
              })
            } else {
              logUpdate('contact_methods', String(row.id), undefined, { email: row.value, reason: 'hard_bounce', detail: String(evt.reason || '') })
            }
          }
        }
        const updated = await markMessageDelivery(sgMessageId, smtpId, 'failed', { failed_reason: String(evt.reason || 'Delivery failed') })
        if (updated) {
          matched++
          logUpdate('conversation_messages', String(updated.id), undefined, { message: 'Delivery failed', delivery: 'failed', reason: evt.reason })
        }
      } else if (kind === 'dropped') {
        // SendGrid refused the send (its own suppression list, invalid address…).
        // Surface it on the message; the address-level cause already lives wherever
        // the original bounce/complaint was recorded.
        const updated = await markMessageDelivery(sgMessageId, smtpId, 'failed', { failed_reason: String(evt.reason || 'Dropped by provider') })
        if (updated) {
          matched++
          logUpdate('conversation_messages', String(updated.id), undefined, { message: 'Delivery failed', delivery: 'failed', reason: evt.reason })
        }
      } else if (kind === 'spamreport') {
        if (recipient) {
          const row = await contactMethodService.suppressByEmail(recipient, 'complaint', undefined)
          if (row) {
            suppressed++
            if (row.subscriber_id) {
              logUpdate('subscribers', String(row.subscriber_id), undefined, {
                badge: 'Email Suppressed', source: 'SendGrid', email: row.value, reason: 'complaint', detail: ''
              })
            } else {
              logUpdate('contact_methods', String(row.id), undefined, { email: row.value, reason: 'complaint', detail: '' })
            }
          }
        }
      } else if (kind === 'unsubscribe' || kind === 'group_unsubscribe') {
        // A consent signal, not a dead mailbox: marketing opt-out only.
        if (recipient) {
          const row = await contactMethodService.unsubscribeFromMarketing(recipient)
          if (row) {
            unsubscribed++
            if (row.subscriber_id) {
              logUpdate('subscribers', String(row.subscriber_id), undefined, {
                badge: 'Unsubscribed', source: 'SendGrid', email: row.value
              })
            }
          }
        }
      } else if (kind === 'delivered') {
        const updated = await markMessageDelivery(sgMessageId, smtpId, 'delivered', {
          delivered_at: evt.timestamp ? new Date(evt.timestamp * 1000).toISOString() : new Date().toISOString(),
        })
        if (updated) {
          matched++
          logUpdate('conversation_messages', String(updated.id), undefined, { message: 'Delivered', delivery: 'delivered' })
        }
      }
    }

    return { status: 'ok', processed: events.length, suppressed, unsubscribed, matched }
  } catch (error: any) {
    console.error('[SendgridEvents] Error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})

// Correlate by the sg_message_id base (equals the send's stored X-Message-Id),
// falling back to the RFC smtp-id when present.
async function markMessageDelivery(
  sgMessageId: string,
  smtpId: string,
  status: 'delivered' | 'failed',
  extra: { failed_reason?: string; delivered_at?: string }
) {
  let updated = sgMessageId ? await messageService.markDeliveryByProviderId(sgMessageId, status, extra) : null
  if (!updated && smtpId) {
    updated = await messageService.markDeliveryByProviderId(smtpId, status, extra)
  }
  return updated
}
