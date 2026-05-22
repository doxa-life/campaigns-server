import { messageService } from '../../../database/conversation-messages'
import { validateMailgunWebhook } from '../../../utils/mailgun-webhook'

/**
 * Mailgun delivery-event webhook. Updates the OUTBOUND message's delivery state only.
 * Never touches `verified` — ownership is established solely by authenticated inbound
 * (see inbound webhook). Deliverability lives on the message row, separate from consent.
 */
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
  const messageId =
    eventData.message?.headers?.['message-id'] ||
    eventData['message-id'] ||
    body['Message-Id'] ||
    ''

  if (!messageId) {
    // Nothing to correlate — acknowledge so Mailgun doesn't retry a useless event.
    return { status: 'ignored' }
  }

  try {
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
      return { status: 'failed', matched: !!updated }
    }

    return { status: 'ignored', event: eventType }
  } catch (error: any) {
    console.error('[DeliveryWebhook] Error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})
