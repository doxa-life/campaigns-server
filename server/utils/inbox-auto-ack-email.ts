import { t, normalizeLocale, localePath } from './translations'
import { inboxEmailService } from './inbox-email'
import { buildContactReplyAddress } from './inbox-addressing'
import { renderInboxMessageEmail } from './inbox-email-layout'

/** Absolute link to the contact verification page for a token, in the sender's language. */
export function buildContactVerificationUrl(token: string, language?: string | null): string {
  const baseUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  return `${baseUrl}${localePath('/contact/verify', language ?? 'en')}?token=${token}`
}

/**
 * Translated "we got your message" auto-acknowledgement.
 * Sent from contact@, Reply-To = the conversation token so a reply threads back.
 * When `verificationUrl` is set the sender's address is unverified: the subject asks
 * them to confirm it and the body carries the link, so one email does both jobs.
 * Callers are responsible for suppressing this for auto-responders/bounces and blocklisted senders.
 */
export async function sendInboxAutoAck(opts: {
  to: string
  name?: string | null
  language?: string | null
  replyToken: string
  verificationUrl?: string | null
}): Promise<boolean> {
  if (!opts.to) return false

  const config = useRuntimeConfig()
  const appName = config.appName || 'Doxa'
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'
  const locale = normalizeLocale(opts.language)

  const subject = opts.verificationUrl
    ? t('inbox.autoAck.subjectVerify', locale, { appName })
    : t('inbox.autoAck.subject', locale, { appName })
  const greeting = opts.name
    ? t('inbox.autoAck.greetingNamed', locale, { name: opts.name })
    : t('inbox.autoAck.greeting', locale)
  const body = t('inbox.autoAck.body', locale, { appName })
  const signoff = t('inbox.autoAck.signoff', locale, { appName })

  const replyTo = buildContactReplyAddress(opts.replyToken, contactAddress)

  let verifyHtml = ''
  let verifyText = ''
  if (opts.verificationUrl) {
    const verifyPrompt = t('inbox.autoAck.verifyPrompt', locale)
    const verifyButton = t('inbox.autoAck.verifyButton', locale)
    verifyHtml = `
      <p style="margin-top:20px;">${verifyPrompt}</p>
      <p style="margin:20px 0;">
        <a href="${opts.verificationUrl}" style="background:#3B463D;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:5px;display:inline-block;">${verifyButton}</a>
      </p>
      <p style="font-size:14px;color:#666666;word-break:break-all;">${opts.verificationUrl}</p>
    `
    verifyText = `\n\n${verifyPrompt}\n${opts.verificationUrl}`
  }

  const content = `
      <p>${greeting}</p>
      <p>${body}</p>
      ${verifyHtml}
      <p style="margin-top:24px;">${signoff.replace(/\n/g, '<br>')}</p>
  `
  const html = renderInboxMessageEmail({ bodyHtml: content, locale, subject })
  const text = `${greeting}\n\n${body}${verifyText}\n\n${signoff}`

  const result = await inboxEmailService.send({
    from: `"Doxa Prayer" <${contactAddress}>`,
    to: opts.to,
    subject,
    html,
    text,
    replyTo,
    autoReply: true,
  })
  return result.success
}
