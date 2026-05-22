export interface InboxEmailAttachment {
  filename: string
  contentType?: string
  data: Blob | Buffer | Uint8Array | string
}

export interface InboxEmailPayload {
  from: string
  fromName?: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  inReplyTo?: string
  references?: string
  attachments?: InboxEmailAttachment[]
}

const sentInVitest: InboxEmailPayload[] = []

function formatAddress(email: string, name?: string) {
  if (!name) return email
  const escapedName = name.replace(/"/g, '\\"')
  return `"${escapedName}" <${email}>`
}

export const inboxEmailService = {
  get sentInVitest() {
    return sentInVitest
  },

  clearVitestSent() {
    sentInVitest.length = 0
  },

  async send(payload: InboxEmailPayload): Promise<string | null> {
    if (process.env.VITEST) {
      sentInVitest.push(payload)
      return `<vitest-${sentInVitest.length}@doxa.life>`
    }

    const config = useRuntimeConfig()
    const domain = String(config.mailgunDomain || '')
    const apiKey = String(config.mailgunApiKey || '')
    const host = String(config.mailgunHost || 'api.mailgun.net').replace(/^https?:\/\//, '')

    if (!domain || !apiKey) {
      throw new Error('MAILGUN_DOMAIN and MAILGUN_API_KEY are required for inbox email')
    }

    const form = new FormData()
    form.append('from', formatAddress(payload.from, payload.fromName))
    for (const recipient of Array.isArray(payload.to) ? payload.to : [payload.to]) {
      form.append('to', recipient)
    }
    form.append('subject', payload.subject)
    if (payload.html) form.append('html', payload.html)
    if (payload.text) form.append('text', payload.text)
    if (payload.replyTo) form.append('h:Reply-To', payload.replyTo)
    if (payload.inReplyTo) form.append('h:In-Reply-To', payload.inReplyTo)
    if (payload.references) form.append('h:References', payload.references)

    for (const attachment of payload.attachments || []) {
      const blob = attachment.data instanceof Blob
        ? attachment.data
        : new Blob([attachment.data as any], { type: attachment.contentType || 'application/octet-stream' })
      form.append('attachment', blob, attachment.filename)
    }

    const auth = Buffer.from(`api:${apiKey}`).toString('base64')
    const response = await fetch(`https://${host}/v3/${domain}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: form
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(result.message || `Mailgun send failed with ${response.status}`)
    }

    return result.id || null
  }
}
