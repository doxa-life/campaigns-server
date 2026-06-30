/**
 * App-level email transport for marketing emails.
 *
 * Marketing sends on its OWN Mailgun domain (MARKETING_MAILGUN_DOMAIN) with its
 * own API key, so its sending reputation is isolated from transactional + inbox
 * mail. From identities come from the marketing_senders table; the domain is
 * appended here so From always aligns with this domain's DKIM.
 *
 * Provider: Mailgun HTTP API when EMAIL_PROVIDER=mailgun and the marketing
 * Mailgun vars are set; otherwise falls back to the base-layer sendEmail (which
 * in dev points at MailHog). That fallback keeps local dev and unconfigured
 * environments working without a separate marketing domain.
 *
 * `sendEmail` is auto-imported in the Nitro server context (base layer util).
 */
export interface MarketingSendOptions {
  // Full address, e.g. '"Doxa Updates" <updates@mail.doxa.life>'. When omitted
  // (no sender / marketing domain not configured), the base transport's default
  // From (SMTP_FROM) is used.
  from?: string
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  // RFC 8058 one-click unsubscribe endpoint (receives a POST). When set, the
  // List-Unsubscribe + List-Unsubscribe-Post headers are added so Gmail/Yahoo/
  // Apple Mail render a native one-click unsubscribe and route opt-outs here.
  listUnsubscribeUrl?: string
}

function getMarketingMailgunConfig() {
  const config = useRuntimeConfig()
  return {
    apiKey: config.marketingMailgunApiKey || process.env.MARKETING_MAILGUN_API_KEY || '',
    domain: config.marketingMailgunDomain || process.env.MARKETING_MAILGUN_DOMAIN || '',
    host: config.marketingMailgunHost || process.env.MARKETING_MAILGUN_HOST || 'api.mailgun.net',
  }
}

/**
 * Build a sender's full From address on the marketing domain.
 * Returns null when the marketing domain isn't configured.
 */
export function buildMarketingFrom(name: string, localPart: string): string | null {
  const { domain } = getMarketingMailgunConfig()
  if (!domain) return null
  const address = `${localPart}@${domain}`
  return name ? `"${name.replace(/"/g, '')}" <${address}>` : address
}

export async function sendMarketingEmail(options: MarketingSendOptions): Promise<boolean> {
  const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase()
  const { apiKey, domain, host } = getMarketingMailgunConfig()

  // Use the dedicated marketing Mailgun domain when fully configured.
  if (provider === 'mailgun' && apiKey && domain && options.from) {
    try {
      const form = new FormData()
      form.append('from', options.from)
      form.append('to', options.to)
      form.append('subject', options.subject)
      form.append('html', options.html)
      form.append('text', options.text || options.html.replace(/<[^>]*>/g, ''))
      if (options.replyTo) form.append('h:Reply-To', options.replyTo)
      if (options.listUnsubscribeUrl) {
        form.append('h:List-Unsubscribe', `<${options.listUnsubscribeUrl}>`)
        form.append('h:List-Unsubscribe-Post', 'List-Unsubscribe=One-Click')
      }

      const url = `https://${host}/v3/${domain}/messages`
      const auth = Buffer.from(`api:${apiKey}`).toString('base64')

      // Cap each request so a hung connection fails fast instead of stalling the serial
      // batch long enough for the stale-job reaper to reclaim (and re-send) live jobs.
      // A timeout throws AbortError, caught below → returns false → claim released → retry.
      const timeoutMs = Number(process.env.MARKETING_SEND_TIMEOUT_MS) || 30000

      // Bound the request with a manually-cleared AbortController rather than
      // AbortSignal.timeout(): under Bun the latter's per-call timer is never
      // reclaimed, so each send leaks memory.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}` },
          body: form,
          signal: controller.signal,
        })

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`[MarketingEmail] Mailgun responded ${res.status}: ${body}`)
          return false
        }
        return true
      } finally {
        clearTimeout(timeout)
      }
    } catch (error: any) {
      console.error('[MarketingEmail] Send failed:', error?.message || error)
      return false
    }
  }

  // Fallback: base-layer transport (dev/MailHog, or marketing domain not set up yet).
  return await sendEmail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  })
}
