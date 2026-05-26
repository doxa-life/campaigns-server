import { inboxEmailService } from './inbox-email'
import { normalizeLocale, t } from './translations'

export async function sendInboxAutoAckEmail(data: {
  to: string
  language?: string
  replyTo: string
}) {
  const config = useRuntimeConfig()
  const language = normalizeLocale(data.language)
  const subject = t('email.inboxAutoAck.subject', language)
  const body = t('email.inboxAutoAck.body', language)
  await inboxEmailService.send({
    from: String(config.inboxContactAddress || 'contact@doxa.life'),
    fromName: 'Doxa Prayer',
    to: data.to,
    subject,
    html: `<p>${body}</p>`,
    text: body,
    replyTo: data.replyTo
  })
}
