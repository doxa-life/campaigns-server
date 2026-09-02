import { simpleParser } from 'mailparser'
import {
  parseSnsMessage,
  validateSnsMessage,
  confirmSnsSubscription,
  releaseSeenSnsMessage,
} from '../../../utils/sns-webhook'
import {
  fetchSesInboundRaw,
  headersFromHeaderLines,
  parseSesAuthentication,
  type SesInboundNotification,
} from '../../../utils/ses-inbound'
import { extractEmailAddress, extractDisplayName } from '../../../utils/mailgun-inbound'
import { stripQuotedHtml, stripQuotedText } from '../../../utils/email-reply-stripper'
import {
  processInboundEmail,
  isStorableAttachment,
  TransientInboundError,
  type InboundAttachment,
} from '../../../utils/inbound-email-processor'

/**
 * SES inbound webhook (SNS HTTPS subscription). The receipt rule stores each
 * incoming email's raw MIME in S3 and publishes a Received notification here;
 * this adapter verifies the SNS signature, fetches and parses the MIME
 * (mailparser), derives the stripped variants and auth verdicts SES doesn't
 * pre-compute, and feeds the provider-neutral inbound processor. Transient
 * failures return a retryable 5xx with the SNS MessageId released so the
 * retry (same id) isn't rejected as a replay.
 */
export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8').catch(() => undefined)
  const msg = parseSnsMessage(rawBody)
  if (!msg) {
    throw createError({ statusCode: 400, statusMessage: 'Malformed payload' })
  }

  if (!process.env.VITEST || getHeader(event, 'x-test-verify-sig') === '1') {
    const result = await validateSnsMessage(msg)
    if (!result.ok) {
      throw createError({ statusCode: 406, statusMessage: result.reason || 'Invalid signature' })
    }
  }

  if (msg.Type === 'SubscriptionConfirmation') {
    const confirmed = await confirmSnsSubscription(msg)
    if (!confirmed) console.error('[SesInbound] Subscription confirmation failed for', msg.TopicArn)
    return { status: confirmed ? 'subscribed' : 'subscription_confirm_failed' }
  }
  if (msg.Type !== 'Notification') {
    return { status: 'ignored' }
  }

  let notification: SesInboundNotification
  try {
    notification = JSON.parse(msg.Message)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Malformed notification payload' })
  }
  if (notification.notificationType !== 'Received') {
    return { status: 'ignored', reason: 'not_received' }
  }

  const receipt = notification.receipt || {}
  // SES scanned it and found malware — never ingest or store it.
  if ((receipt.virusVerdict?.status || '').toUpperCase() === 'FAIL') {
    return { status: 'ignored', reason: 'virus' }
  }

  // The envelope recipient (RCPT TO), which carries the inbox plus-addressing tags.
  const recipient = receipt.recipients?.[0] || ''
  if (!recipient) {
    return { status: 'ignored', reason: 'no_recipient' }
  }

  try {
    const raw = await fetchSesInboundRaw(notification)
    if (!raw) {
      // No inline content and no S3 location — nothing to parse, and a retry
      // can't change that. Acknowledge so SNS stops retrying.
      console.error('[SesInbound] Notification carried no message content', notification.mail?.messageId)
      return { status: 'ignored', reason: 'no_content' }
    }

    const parsed = await simpleParser(raw)
    const headers = headersFromHeaderLines(parsed.headerLines || [])

    const fromEmail =
      parsed.from?.value?.[0]?.address?.toLowerCase() ||
      extractEmailAddress(headers.get('from') || notification.mail?.source || '')
    if (!fromEmail) {
      // A message with no parseable sender is garbage a retry can't fix.
      return { status: 'ignored', reason: 'missing_sender' }
    }
    const fromName = parsed.from?.value?.[0]?.name || extractDisplayName(headers.get('from')) || null

    const bodyHtml = typeof parsed.html === 'string' ? parsed.html : ''
    const bodyPlain = parsed.text || ''
    // SES delivers raw MIME only — derive the "new content" variants Mailgun
    // used to pre-compute (the inbox UI's quoted-history toggle relies on the
    // stripped variant differing from the full body).
    const bodyStrippedHtml = bodyHtml ? stripQuotedHtml(bodyHtml) : ''
    const bodyText = bodyPlain ? stripQuotedText(bodyPlain) : ''

    const attachments: InboundAttachment[] = []
    for (const att of parsed.attachments || []) {
      const filename = att.filename || ''
      if (!isStorableAttachment(filename, att.size)) continue
      attachments.push({
        filename,
        contentType: att.contentType || 'application/octet-stream',
        size: att.size,
        data: att.content,
      })
    }

    return await processInboundEmail({
      recipient,
      fromEmail,
      fromName,
      subject: parsed.subject || '',
      bodyHtml,
      bodyStrippedHtml,
      bodyText: bodyText || bodyPlain,
      headers,
      messageId: parsed.messageId || headers.get('message-id') || null,
      // SES's spam signal is a verdict, not a numeric score; the blocklist and
      // held flows carry junk handling.
      spamScore: null,
      auth: parseSesAuthentication(receipt, headers, fromEmail),
      attachments,
      rawMime: raw,
      simulateDbFailure: !!process.env.VITEST && getHeader(event, 'x-test-fail') === 'db',
    })
  } catch (error: any) {
    // Release the seen MessageId so SNS's retry (same id) isn't rejected as a replay.
    releaseSeenSnsMessage(msg.MessageId)
    if (error instanceof TransientInboundError) {
      throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
    }
    console.error('[SesInbound] Persistence error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})
