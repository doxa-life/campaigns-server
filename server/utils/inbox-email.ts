/**
 * App-level email transport for the shared inbox.
 *
 * The base-layer `sendEmail` cannot set Reply-To, threading headers, or attachments,
 * all of which the inbox needs. This service controls From / Reply-To / In-Reply-To /
 * References and attachment parts directly. Existing emails keep using the base `sendEmail`.
 *
 * Provider is abstracted: Mailgun HTTP API in production (EMAIL_PROVIDER=mailgun), and
 * SMTP (nodemailer) otherwise — which in local dev points at MailHog (localhost:1025),
 * so replies show up at http://localhost:8025. Swapping to Postmark later stays localized.
 */
import nodemailer from 'nodemailer'

export interface InboxEmailAttachment {
  filename: string
  contentType: string
  data: Buffer
  // When set, the part is embedded inline (Content-ID) rather than attached,
  // and the HTML references it as `cid:<cid>`. For Mailgun the cid must equal
  // the filename, so callers should set filename === cid for inline parts.
  cid?: string
}

export interface InboxEmailOptions {
  from: string // full address, e.g. '"George with Doxa" <george@doxa.life>'
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  inReplyTo?: string
  references?: string
  attachments?: InboxEmailAttachment[]
  // RFC 3834: mark this as an automated reply (Auto-Submitted: auto-replied + Precedence: bulk)
  // so other mail servers don't bounce or auto-reply back. Set on the auto-ack / held-sender notices.
  autoReply?: boolean
}

export interface InboxEmailResult {
  success: boolean
  providerMessageId?: string // RFC Message-Id assigned by the provider (with angle brackets)
  error?: string
}

// In VITEST we never hit the network — sends are recorded here so tests can assert.
interface RecordedEmail extends InboxEmailOptions {
  providerMessageId: string
}
const recordedEmails: RecordedEmail[] = []

export function getRecordedInboxEmails(): RecordedEmail[] {
  return recordedEmails
}

export function clearRecordedInboxEmails(): void {
  recordedEmails.length = 0
}

function getMailgunConfig() {
  const config = useRuntimeConfig()
  return {
    apiKey: config.mailgunApiKey || process.env.MAILGUN_API_KEY || '',
    domain: config.mailgunDomain || process.env.MAILGUN_DOMAIN || '',
    host: config.mailgunHost || process.env.MAILGUN_HOST || 'api.mailgun.net',
  }
}

class InboxEmailService {
  async send(options: InboxEmailOptions): Promise<InboxEmailResult> {
    // Short-circuit in tests: record the payload, return a synthetic message id.
    if (process.env.VITEST) {
      const providerMessageId = `<test-${Date.now()}-${Math.random().toString(36).slice(2)}@inbox.test>`
      recordedEmails.push({ ...options, providerMessageId })
      return { success: true, providerMessageId }
    }

    try {
      const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase()
      const { apiKey, domain } = getMailgunConfig()
      if (provider === 'mailgun' && apiKey && domain) {
        return await this.sendViaMailgun(options)
      }
      // Default / local dev: SMTP (MailHog at localhost:1025 → http://localhost:8025)
      return await this.sendViaSmtp(options)
    } catch (error: any) {
      console.error('[InboxEmail] Send failed:', error?.message || error)
      return { success: false, error: error?.message || 'Unknown send error' }
    }
  }

  private async sendViaSmtp(options: InboxEmailOptions): Promise<InboxEmailResult> {
    const config = useRuntimeConfig()
    const transporter = nodemailer.createTransport({
      host: config.smtpHost || process.env.SMTP_HOST || 'localhost',
      port: parseInt(String(config.smtpPort || process.env.SMTP_PORT || '1025'), 10),
      secure: String(config.smtpSecure || process.env.SMTP_SECURE || 'false') === 'true',
      auth: (config.smtpUser || process.env.SMTP_USER)
        ? { user: config.smtpUser || process.env.SMTP_USER, pass: config.smtpPass || process.env.SMTP_PASS }
        : undefined,
      tls: { rejectUnauthorized: false },
    })

    const info = await transporter.sendMail({
      from: options.from,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
      replyTo: options.replyTo,
      inReplyTo: options.inReplyTo,
      references: options.references,
      headers: options.autoReply ? { 'Auto-Submitted': 'auto-replied', 'Precedence': 'bulk' } : undefined,
      attachments: (options.attachments || []).map(a => ({
        filename: a.filename,
        content: a.data,
        contentType: a.contentType,
        ...(a.cid ? { cid: a.cid } : {}),
      })),
    })
    return { success: true, providerMessageId: info.messageId }
  }

  private async sendViaMailgun(options: InboxEmailOptions): Promise<InboxEmailResult> {
    const { apiKey, domain, host } = getMailgunConfig()
    if (!apiKey || !domain) {
      throw new Error('Mailgun configuration incomplete. Set MAILGUN_API_KEY and MAILGUN_DOMAIN.')
    }

    const form = new FormData()
    form.append('from', options.from)
    const recipients = Array.isArray(options.to) ? options.to : [options.to]
    for (const r of recipients) form.append('to', r)
    form.append('subject', options.subject)
    form.append('html', options.html)
    form.append('text', options.text || options.html.replace(/<[^>]*>/g, ''))

    if (options.replyTo) form.append('h:Reply-To', options.replyTo)
    if (options.inReplyTo) form.append('h:In-Reply-To', options.inReplyTo)
    if (options.references) form.append('h:References', options.references)
    if (options.autoReply) {
      form.append('h:Auto-Submitted', 'auto-replied')
      form.append('h:Precedence', 'bulk')
    }

    for (const att of options.attachments || []) {
      // Buffer is a valid BlobPart at runtime; cast to satisfy the DOM lib's ArrayBuffer typing.
      const blob = new Blob([att.data as unknown as BlobPart], { type: att.contentType || 'application/octet-stream' })
      // Inline parts (cid set) go in the `inline` field and are referenced as
      // cid:<filename> in the HTML; everything else is a regular attachment.
      form.append(att.cid ? 'inline' : 'attachment', blob, att.filename)
    }

    const url = `https://${host}/v3/${domain}/messages`
    const auth = Buffer.from(`api:${apiKey}`).toString('base64')

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Mailgun responded ${res.status}: ${body}`)
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
    return { success: true, providerMessageId: json.id }
  }
}

export const inboxEmailService = new InboxEmailService()
