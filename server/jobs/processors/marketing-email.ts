import type { Job, MarketingEmailPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { marketingEmailService } from '../../database/marketing-emails'
import { marketingSenderService } from '../../database/marketing-senders'
import { subscriberService } from '../../database/subscribers'
import { contactMethodService } from '../../database/contact-methods'
import { renderMarketingEmailHtml, renderMarketingEmailFromHtml, tiptapToText } from '../../utils/marketing-email-template'
import { getMarketingTemplate } from '../../utils/marketing-templates'
import { buildMarketingFrom, sendMarketingEmail } from '../../utils/marketing-email-sender'
import { localePath } from '../../utils/translations'

const emailCache = new Map<number, { email: any; text: string; from?: string; replyTo?: string }>()

export async function processMarketingEmail(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as MarketingEmailPayload
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'

  let cached = emailCache.get(payload.marketing_email_id)
  if (!cached) {
    const email = await marketingEmailService.getByIdWithPeopleGroup(payload.marketing_email_id)
    if (!email) {
      return { success: false, data: { error: 'Parent email not found' } }
    }

    if (email.status === 'queued') {
      await marketingEmailService.updateStatus(email.id, 'sending')
    }

    // Resolve the From identity (chosen sender, else the default sender).
    // Reply-To defaults to the inbox contact address so replies land in the inbox.
    const sender = email.sender_id
      ? await marketingSenderService.getById(email.sender_id)
      : await marketingSenderService.getDefault()
    const from = sender ? (buildMarketingFrom(sender.name, sender.local_part) ?? undefined) : undefined
    const replyTo = sender?.reply_to || config.inboxContactAddress || undefined

    cached = { email, text: tiptapToText(email.content_json), from, replyTo }
    emailCache.set(payload.marketing_email_id, cached)

    setTimeout(() => emailCache.delete(payload.marketing_email_id), 5 * 60 * 1000)
  }

  let subscriber = await subscriberService.getSubscriberByContactMethodId(payload.contact_method_id)
  // The admins test audience has no contact_method (id 0); resolve by recipient
  // email instead so a test send still gets a working personalized link when
  // the recipient is also a subscriber.
  if (!subscriber && payload.recipient_email) {
    const contact = await contactMethodService.getByValue('email', payload.recipient_email)
    if (contact) subscriber = await subscriberService.getSubscriberById(contact.subscriber_id)
  }
  const profileId = subscriber?.profile_id || 'unknown'
  const subscriberLanguage = subscriber?.preferred_language || 'en'

  let unsubscribeUrl: string
  if (cached.email.audience_type === 'people_group' && cached.email.people_group_slug) {
    unsubscribeUrl = `${baseUrl}${localePath('/unsubscribe', subscriberLanguage)}?id=${profileId}&type=people_group&slug=${cached.email.people_group_slug}`
  } else {
    unsubscribeUrl = `${baseUrl}${localePath('/unsubscribe', subscriberLanguage)}?id=${profileId}&type=doxa`
  }

  const template = await getMarketingTemplate(cached.email.template)

  let html: string
  let subject: string
  let text: string

  if (template) {
    // Templated emails render per-recipient in the subscriber's language and
    // carry a personalized survey link; the stored subject/content are unused.
    // The template key IS the survey key, so the link targets that survey.
    const surveyUrl = `${baseUrl}${localePath(`/survey/${cached.email.template}`, subscriberLanguage)}?id=${profileId}`
    const vars = { surveyUrl, name: subscriber?.name }
    const contentHtml = template.renderContentHtml(subscriberLanguage, vars)
    html = renderMarketingEmailFromHtml(contentHtml, undefined, unsubscribeUrl, subscriberLanguage, template.getHeader(subscriberLanguage))
    subject = template.getSubject(subscriberLanguage)
    text = template.renderText(subscriberLanguage, vars)
  } else {
    html = renderMarketingEmailHtml(
      cached.email.content_json,
      cached.email.audience_type === 'people_group' ? cached.email.people_group_name : undefined,
      unsubscribeUrl,
      subscriberLanguage
    )
    subject = cached.email.subject
    text = cached.text
  }

  const sent = await sendMarketingEmail({
    from: cached.from,
    replyTo: cached.replyTo,
    to: payload.recipient_email,
    subject,
    html,
    text
  })

  if (sent) {
    await marketingEmailService.incrementSentCount(payload.marketing_email_id)
    console.log(`  Sent marketing email to ${payload.recipient_email}`)
    return { success: true }
  } else {
    await marketingEmailService.incrementFailedCount(payload.marketing_email_id)
    throw new Error('Email send failed')
  }
}
