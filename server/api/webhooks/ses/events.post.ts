import { messageService } from '../../../database/conversation-messages'
import { contactMethodService } from '../../../database/contact-methods'
import {
  parseSnsMessage,
  validateSnsMessage,
  confirmSnsSubscription,
  releaseSeenSnsMessage,
} from '../../../utils/sns-webhook'

/**
 * AWS SES event webhook (SNS HTTPS subscription). The SES configuration sets
 * publish Bounce/Complaint/Delivery events to an SNS topic subscribed to this
 * endpoint. Two independent jobs, mirroring the Mailgun delivery webhook:
 *  1. Address suppression — permanent bounces / complaints flag the recipient on
 *     contact_methods (suppressed_at) so every send path stops mailing it.
 *     Transient bounces are ignored (SES retries them).
 *  2. Outbound message state — updates the matching conversation message's
 *     delivery state by the SES message id.
 * Never touches `verified` — ownership is established solely by authenticated
 * inbound. Also answers the SNS subscription-confirmation handshake.
 */

interface SesEventData {
  eventType?: string
  notificationType?: string // identity-level notification shape
  mail?: {
    messageId?: string
    commonHeaders?: { messageId?: string }
  }
  bounce?: {
    bounceType?: string
    bounceSubType?: string
    bouncedRecipients?: { emailAddress?: string; status?: string; diagnosticCode?: string }[]
  }
  complaint?: {
    complainedRecipients?: { emailAddress?: string }[]
    complaintFeedbackType?: string
  }
  delivery?: {
    timestamp?: string
    smtpResponse?: string
  }
}

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8').catch(() => undefined)
  const msg = parseSnsMessage(rawBody)
  if (!msg) {
    throw createError({ statusCode: 400, statusMessage: 'Malformed payload' })
  }

  // Signature/topic/replay validation. Skipped under VITEST so tests can post
  // synthetic envelopes; x-test-verify-sig opts a test back in to exercise it.
  if (!process.env.VITEST || getHeader(event, 'x-test-verify-sig') === '1') {
    const result = await validateSnsMessage(msg)
    if (!result.ok) {
      throw createError({ statusCode: 406, statusMessage: result.reason || 'Invalid signature' })
    }
  }

  if (msg.Type === 'SubscriptionConfirmation') {
    const confirmed = await confirmSnsSubscription(msg)
    if (!confirmed) console.error('[SesEvents] Subscription confirmation failed for', msg.TopicArn)
    return { status: confirmed ? 'subscribed' : 'subscription_confirm_failed' }
  }
  if (msg.Type !== 'Notification') {
    return { status: 'ignored' }
  }

  let eventData: SesEventData
  try {
    eventData = JSON.parse(msg.Message)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Malformed event payload' })
  }

  // Configuration-set events carry eventType; identity-level notifications carry notificationType.
  const eventType = String(eventData.eventType || eventData.notificationType || '').toLowerCase()
  const sesMessageId = eventData.mail?.messageId || ''
  const headerMessageId = eventData.mail?.commonHeaders?.messageId || ''

  try {
    if (eventType === 'bounce') {
      const bounce = eventData.bounce || {}
      const permanent = String(bounce.bounceType || '').toLowerCase() === 'permanent'
      let suppressed = false

      for (const recipient of bounce.bouncedRecipients || []) {
        const address = recipient.emailAddress || ''
        if (!address || !permanent) continue
        const detail = recipient.diagnosticCode || recipient.status || bounce.bounceSubType || ''
        const row = await contactMethodService.suppressByEmail(address, 'hard_bounce', detail || undefined)
        if (row) {
          suppressed = true
          if (row.subscriber_id) {
            logUpdate('subscribers', String(row.subscriber_id), undefined, {
              badge: 'Email Suppressed', source: 'SES', email: row.value, reason: 'hard_bounce', detail: String(detail)
            })
          } else {
            logUpdate('contact_methods', String(row.id), undefined, { email: row.value, reason: 'hard_bounce', detail: String(detail) })
          }
        }
      }

      const reason = bounce.bouncedRecipients?.[0]?.diagnosticCode || bounce.bounceSubType || 'Delivery failed'
      const updated = await markMessageDelivery(sesMessageId, headerMessageId, 'failed', { failed_reason: String(reason) })
      if (updated) {
        logUpdate('conversation_messages', String(updated.id), undefined, { message: 'Delivery failed', delivery: 'failed', reason })
      }
      return { status: permanent ? 'suppressed' : 'ignored', suppressed, matched: !!updated }
    }

    if (eventType === 'complaint') {
      const complaint = eventData.complaint || {}
      const detail = complaint.complaintFeedbackType || ''
      let suppressed = false

      for (const recipient of complaint.complainedRecipients || []) {
        const address = recipient.emailAddress || ''
        if (!address) continue
        const row = await contactMethodService.suppressByEmail(address, 'complaint', detail || undefined)
        if (row) {
          suppressed = true
          if (row.subscriber_id) {
            logUpdate('subscribers', String(row.subscriber_id), undefined, {
              badge: 'Email Suppressed', source: 'SES', email: row.value, reason: 'complaint', detail: String(detail)
            })
          } else {
            logUpdate('contact_methods', String(row.id), undefined, { email: row.value, reason: 'complaint', detail: String(detail) })
          }
        }
      }
      return { status: 'suppressed', suppressed }
    }

    if (eventType === 'delivery') {
      const updated = await markMessageDelivery(sesMessageId, headerMessageId, 'delivered', {
        delivered_at: eventData.delivery?.timestamp || new Date().toISOString(),
      })
      if (updated) {
        logUpdate('conversation_messages', String(updated.id), undefined, { message: 'Delivered', delivery: 'delivered' })
      }
      return { status: 'delivered', matched: !!updated }
    }

    return { status: 'ignored', event: eventType }
  } catch (error: any) {
    // Release the seen MessageId so SNS's retry (same id) isn't rejected as a replay.
    releaseSeenSnsMessage(msg.MessageId)
    console.error('[SesEvents] Error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})

// Correlate by the SES message id first (matches the stored <id@region.amazonses.com>
// via its local part), falling back to the RFC Message-ID header when present.
async function markMessageDelivery(
  sesMessageId: string,
  headerMessageId: string,
  status: 'delivered' | 'failed',
  extra: { failed_reason?: string; delivered_at?: string }
) {
  let updated = sesMessageId ? await messageService.markDeliveryByProviderId(sesMessageId, status, extra) : null
  if (!updated && headerMessageId) {
    updated = await messageService.markDeliveryByProviderId(headerMessageId, status, extra)
  }
  return updated
}
