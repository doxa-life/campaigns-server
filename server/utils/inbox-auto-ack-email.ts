import { t, normalizeLocale } from './translations'
import { inboxEmailService } from './inbox-email'
import { buildContactReplyAddress } from './inbox-addressing'

/**
 * Translated "we got your message" auto-acknowledgement.
 * Sent from contact@, Reply-To = the conversation token so a reply threads back.
 * Callers are responsible for suppressing this for auto-responders/bounces and blocklisted senders.
 */
export async function sendInboxAutoAck(opts: {
  to: string
  name?: string | null
  language?: string | null
  replyToken: string
}): Promise<boolean> {
  if (!opts.to) return false

  const config = useRuntimeConfig()
  const appName = config.appName || 'Doxa'
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'
  const locale = normalizeLocale(opts.language)

  const subject = t('inbox.autoAck.subject', locale, { appName })
  const greeting = opts.name
    ? t('inbox.autoAck.greetingNamed', locale, { name: opts.name })
    : t('inbox.autoAck.greeting', locale)
  const body = t('inbox.autoAck.body', locale, { appName })
  const signoff = t('inbox.autoAck.signoff', locale, { appName })

  const replyTo = buildContactReplyAddress(opts.replyToken, contactAddress)

  const html = `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; max-width: 600px; margin: 0 auto; padding: 20px;">
      <p style="font-size:16px;">${greeting}</p>
      <p style="font-size:16px;">${body}</p>
      <p style="font-size:16px; margin-top:24px;">${signoff.replace(/\n/g, '<br>')}</p>
    </body>
    </html>
  `
  const text = `${greeting}\n\n${body}\n\n${signoff}`

  const result = await inboxEmailService.send({
    from: `"Doxa Prayer" <${contactAddress}>`,
    to: opts.to,
    subject,
    html,
    text,
    replyTo,
  })
  return result.success
}
