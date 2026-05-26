import { messageService } from '#server/database/conversation-messages'
import { verifyMailgunSignature } from '#server/utils/inbox-mailgun'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<any>(event)
  const signature = body.signature || body

  const ok = verifyMailgunSignature({
    timestamp: String(signature.timestamp || ''),
    token: String(signature.token || ''),
    signature: String(signature.signature || ''),
    signingKey: String(config.mailgunWebhookSigningKey || '')
  })
  if (!ok) {
    throw createError({ statusCode: 406, statusMessage: 'Invalid Mailgun signature' })
  }

  const eventData = body['event-data'] || body
  const providerId = eventData?.message?.headers?.['message-id']
    || eventData?.message?.headers?.['Message-Id']
    || eventData?.id
    || body['Message-Id']
  if (!providerId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing provider message id' })
  }

  const message = await messageService.findByProviderMessageId(providerId)
  if (!message) return { ok: true, ignored: true }

  const eventName = String(eventData.event || body.event || '')
  if (eventName === 'delivered') {
    await messageService.markStatus(message.id, 'delivered', { delivered_at: new Date() })
  } else if (['failed', 'permanent_fail', 'rejected'].includes(eventName)) {
    await messageService.markStatus(message.id, 'failed', {
      failed_reason: eventData.reason || eventData['delivery-status']?.message || 'Mailgun delivery failed'
    })
  }

  return { ok: true }
})
