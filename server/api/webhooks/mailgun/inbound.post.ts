import { validateMailgunWebhook, releaseSeenToken } from '../../../utils/mailgun-webhook'
import {
  parseMessageHeaders,
  parseAuthentication,
  parseSpamScore,
  extractEmailAddress,
  extractDisplayName,
} from '../../../utils/mailgun-inbound'
import {
  processInboundEmail,
  isStorableAttachment,
  TransientInboundError,
  type InboundAttachment,
} from '../../../utils/inbound-email-processor'

/**
 * Mailgun inbound webhook (route store/forward). Mailgun parses the MIME and
 * POSTs the fields (body-html, stripped-html, message-headers, attachments as
 * file parts); this adapter verifies the Mailgun signature, maps that payload
 * shape onto the provider-neutral inbound processor, and translates transient
 * failures into a retryable 5xx (releasing the signature token so Mailgun's
 * retry — same token — isn't rejected as a replay).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // --- Read payload (multipart or urlencoded) ---
  let form: FormData
  try {
    form = await readFormData(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Malformed payload' })
  }
  const field = (name: string): string | null => {
    const v = form.get(name)
    return typeof v === 'string' ? v : null
  }

  // --- Verify Mailgun webhook signature (skipped in tests unless explicitly exercised) ---
  const enforceSignature = !process.env.VITEST || field('x-test-verify-sig') === '1'
  const sigToken = field('token') || ''
  if (enforceSignature) {
    const result = validateMailgunWebhook(
      { timestamp: field('timestamp') || '', token: sigToken, signature: field('signature') || '' },
      config.mailgunWebhookSigningKey
    )
    if (!result.ok) {
      throw createError({ statusCode: 406, statusMessage: result.reason || 'Invalid signature' })
    }
  }

  // --- Gather fields ---
  const recipient = field('recipient') || ''
  const fromHeaderRaw = field('from') || field('sender') || ''
  const fromEmail = extractEmailAddress(fromHeaderRaw)

  if (!recipient || !fromEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Missing recipient or sender' })
  }

  const headers = parseMessageHeaders(field('message-headers'))

  const attachments: InboundAttachment[] = []
  for (const [, value] of form.entries()) {
    if (typeof value === 'string') continue
    const file = value as File
    if (!isStorableAttachment(file.name, file.size)) continue
    attachments.push({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    })
  }

  const rawMime = field('body-mime')

  try {
    return await processInboundEmail({
      recipient,
      fromEmail,
      fromName: extractDisplayName(fromHeaderRaw),
      subject: field('subject') || '',
      bodyHtml: field('body-html') || '',
      bodyStrippedHtml: field('stripped-html') || '',
      bodyText: field('stripped-text') || field('body-plain') || '',
      headers,
      messageId: headers.get('message-id') || field('Message-Id') || null,
      spamScore: parseSpamScore(headers, Object.fromEntries(form.entries())),
      auth: parseAuthentication(headers, fromEmail),
      attachments,
      rawMime: rawMime ? Buffer.from(rawMime, 'utf-8') : null,
      simulateDbFailure: !!process.env.VITEST && field('x-test-fail') === 'db',
    })
  } catch (error: any) {
    // This token was marked "seen" during signature validation. Since we're about to
    // return a retryable 5xx, release it so the provider's retry (which resends the same
    // token) isn't rejected as a replay and the message isn't lost.
    if (sigToken) releaseSeenToken(sigToken)
    if (error instanceof TransientInboundError) {
      throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
    }
    // The message dedupe race is handled by createIfNew's ON CONFLICT DO NOTHING (it returns
    // null, never raises 23505), so any unique violation reaching here is from an unrelated
    // constraint — retry it (treated as transient) rather than report 200 "handled", which
    // would silently drop a message that wasn't persisted. Unknown errors are transient too.
    console.error('[InboundWebhook] Persistence error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})
