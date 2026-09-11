import { timingSafeEqual } from 'crypto'
import { simpleParser } from 'mailparser'
import {
  headersFromHeaderLines,
  parseSendgridAuthentication,
} from '../../../utils/sendgrid-inbound'
import { extractEmailAddress, extractDisplayName } from '../../../utils/mailgun-inbound'
import { stripQuotedHtml, stripQuotedText } from '../../../utils/email-reply-stripper'
import {
  processInboundEmail,
  isStorableAttachment,
  TransientInboundError,
  type InboundAttachment,
} from '../../../utils/inbound-email-processor'

/**
 * SendGrid Inbound Parse webhook, configured in **raw MIME mode** ("POST the
 * raw, full MIME message"): the full email arrives in the `email` form field
 * alongside SendGrid's SPF/DKIM validation results and the SMTP envelope.
 * This adapter parses the MIME (mailparser), derives the stripped "new
 * content" variants and auth verdicts, and feeds the provider-neutral inbound
 * processor. Transient failures return a retryable 5xx (Inbound Parse retries
 * on non-2xx).
 *
 * Inbound Parse has no signature mechanism, so the webhook URL carries a
 * shared secret: requests must present ?token=<SENDGRID_INBOUND_TOKEN>. In
 * production the endpoint fails closed until that env var is configured;
 * only dev/test run without it.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // URL-token gate (the only authentication Inbound Parse supports). Fails closed:
  // in production the endpoint rejects everything until SENDGRID_INBOUND_TOKEN is
  // configured and matches — inbound content (including its SPF/DKIM result fields)
  // is only trustworthy when the POST provably comes from the configured parse URL.
  // VITEST hook: x-test-inbound-token injects an expected token so tests exercise the gate.
  const testToken = process.env.VITEST ? getHeader(event, 'x-test-inbound-token') : null
  const expectedToken = testToken ?? String(config.sendgridInboundToken || '')
  if (!expectedToken) {
    const isDevelopment = (process.env.NODE_ENV || 'development') === 'development'
    if (!isDevelopment && !process.env.VITEST) {
      throw createError({ statusCode: 401, statusMessage: 'Inbound token not configured' })
    }
  } else {
    const presented = String(getQuery(event).token || '')
    const a = Buffer.from(presented)
    const b = Buffer.from(expectedToken)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid inbound token' })
    }
  }

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

  // The raw MIME can arrive as a text field or a file part depending on content.
  let rawMime: Buffer | null = null
  const rawValue = form.get('email')
  if (typeof rawValue === 'string') {
    rawMime = Buffer.from(rawValue, 'utf-8')
  } else if (rawValue) {
    rawMime = Buffer.from(await (rawValue as File).arrayBuffer())
  }
  if (!rawMime || !rawMime.length) {
    throw createError({ statusCode: 400, statusMessage: 'Missing raw email' })
  }

  // Envelope recipient (RCPT TO) carries the inbox plus-addressing tags.
  let envelope: { to?: string[]; from?: string } = {}
  try {
    envelope = JSON.parse(field('envelope') || '{}')
  } catch {
    envelope = {}
  }

  try {
    const parsed = await simpleParser(rawMime)
    const headers = headersFromHeaderLines(parsed.headerLines || [])

    // One SMTP transaction can carry several recipients (e.g. contact@ plus a staff
    // alias CC'd); reply-token and alias routing key off this one address, so prefer
    // an inbox-domain entry over whatever SendGrid happened to list first.
    const inboxDomain = String(config.inboxDomain || 'doxa.life').toLowerCase()
    const envelopeTo = envelope.to || []
    const recipient =
      envelopeTo.find(r => r.toLowerCase().endsWith(`@${inboxDomain}`)) ||
      envelopeTo[0] ||
      extractEmailAddress(field('to') || headers.get('to') || '') ||
      ''
    const fromEmail =
      parsed.from?.value?.[0]?.address?.toLowerCase() ||
      extractEmailAddress(field('from') || headers.get('from') || '')
    if (!recipient || !fromEmail) {
      // Unroutable without an envelope recipient and sender; a retry can't fix it.
      return { status: 'ignored', reason: !recipient ? 'no_recipient' : 'missing_sender' }
    }
    const fromName = parsed.from?.value?.[0]?.name || extractDisplayName(field('from')) || null

    const bodyHtml = typeof parsed.html === 'string' ? parsed.html : ''
    const bodyPlain = parsed.text || ''
    // Inbound Parse ships no stripped variants — derive the "new content" ones
    // (the inbox UI's quoted-history toggle relies on the stripped variant
    // differing from the full body).
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

    const spamScoreRaw = field('spam_score')
    const spamScore = spamScoreRaw !== null && spamScoreRaw !== '' && !Number.isNaN(Number(spamScoreRaw))
      ? Number(spamScoreRaw)
      : null

    return await processInboundEmail({
      recipient,
      fromEmail,
      fromName,
      subject: parsed.subject || field('subject') || '',
      bodyHtml,
      bodyStrippedHtml,
      bodyText: bodyText || bodyPlain,
      headers,
      messageId: parsed.messageId || headers.get('message-id') || null,
      spamScore,
      auth: parseSendgridAuthentication(
        { dkim: field('dkim'), spf: field('SPF'), envelopeFrom: envelope.from },
        headers,
        fromEmail
      ),
      attachments,
      rawMime,
      simulateDbFailure: !!process.env.VITEST && field('x-test-fail') === 'db',
    })
  } catch (error: any) {
    if (error instanceof TransientInboundError) {
      throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
    }
    console.error('[SendgridInbound] Persistence error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})
