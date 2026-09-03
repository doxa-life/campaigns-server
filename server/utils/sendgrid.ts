import { extractEmailAddress, extractDisplayName } from './mailgun-inbound'

/**
 * Shared Twilio SendGrid transport used by all three send paths — base
 * transactional (email.ts), inbox (inbox-email.ts), and marketing
 * (marketing-email-sender.ts). Sends via a direct fetch to the v3 mail/send
 * JSON API; the response's X-Message-Id header is the id SendGrid's event
 * webhook echoes back (as the prefix of sg_message_id) for delivery/bounce
 * correlation.
 */

export function getSendgridConfig() {
  let config: Record<string, any> = {}
  try {
    config = useRuntimeConfig()
  } catch {
    // Outside the Nitro context (scripts) fall through to process.env
  }
  return {
    apiKey: config.sendgridApiKey || process.env.SENDGRID_API_KEY || '',
    host: config.sendgridHost || process.env.SENDGRID_HOST || 'api.sendgrid.com',
  }
}

export function isSendgridConfigured(): boolean {
  return Boolean(getSendgridConfig().apiKey)
}

export interface SendgridAttachment {
  filename: string
  contentType: string
  data: Buffer
  // When set, the part is embedded inline (Content-ID) and the HTML references it as cid:<cid>.
  cid?: string
}

export interface SendgridSendOptions {
  from: string // full address, e.g. '"George with Doxa" <george@doxa.life>'
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  inReplyTo?: string
  references?: string
  headers?: Record<string, string>
  attachments?: SendgridAttachment[]
}

/** Split a `"Name" <a@b>` style address into SendGrid's {email, name} shape. */
function toAddressObject(value: string): { email: string; name?: string } {
  const email = extractEmailAddress(value) || value
  const name = extractDisplayName(value)
  return name ? { email, name } : { email }
}

/**
 * Send one message via the SendGrid v3 API. Throws on a non-2xx response;
 * returns the X-Message-Id SendGrid assigned.
 */
export async function sendViaSendgrid(options: SendgridSendOptions): Promise<{ messageId?: string }> {
  const { apiKey, host } = getSendgridConfig()
  if (!apiKey) {
    throw new Error('SendGrid configuration incomplete. Set SENDGRID_API_KEY.')
  }

  const recipients = (Array.isArray(options.to) ? options.to : [options.to]).map(toAddressObject)

  const headers: Record<string, string> = { ...(options.headers || {}) }
  if (options.inReplyTo) headers['In-Reply-To'] = options.inReplyTo
  if (options.references) headers['References'] = options.references

  const payload: Record<string, any> = {
    personalizations: [{ to: recipients }],
    from: toAddressObject(options.from),
    subject: options.subject,
    content: [
      { type: 'text/plain', value: options.text || options.html.replace(/<[^>]*>/g, '') },
      { type: 'text/html', value: options.html },
    ],
  }
  if (options.replyTo) payload.reply_to = toAddressObject(options.replyTo)
  if (Object.keys(headers).length) payload.headers = headers
  if (options.attachments?.length) {
    payload.attachments = options.attachments.map(a => ({
      content: a.data.toString('base64'),
      filename: a.filename,
      type: a.contentType || 'application/octet-stream',
      disposition: a.cid ? 'inline' : 'attachment',
      ...(a.cid ? { content_id: a.cid } : {}),
    }))
  }

  // Bound the request with a manually-cleared AbortController rather than
  // AbortSignal.timeout(): under Bun the latter's per-call timer is never
  // reclaimed, so each send leaks memory.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`https://${host}/v3/mail/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`SendGrid responded ${res.status}: ${body}`)
    }
    return { messageId: res.headers.get('x-message-id') || undefined }
  } finally {
    clearTimeout(timeout)
  }
}
