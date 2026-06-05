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

  // Stop sending the moment the parent email is cancelled. Checked live (not via
  // the cached email below) so a mid-send cancel takes effect immediately.
  const liveStatus = await marketingEmailService.getStatus(payload.marketing_email_id)
  if (liveStatus === 'cancelled') {
    return { success: true, data: { skipped: 'cancelled' } }
  }

  // Safety net for addresses suppressed (hard bounce / complaint) after this job
  // was enqueued. Selection-time filtering already excludes most; skip here without
  // counting it as a failure.
  if (await contactMethodService.isSuppressed(payload.recipient_email)) {
    return { success: true, data: { skipped: 'suppressed' } }
  }

  let cached = emailCache.get(payload.marketing_email_id)
  if (!cached) {
    const email = await marketingEmailService.getByIdWithPeopleGroup(payload.marketing_email_id)
    if (!email) {
      return { success: false, data: { error: 'Parent email not found' } }
    }

    if (email.status === 'queued') {
      await marketingEmailService.updateStatus(email.id, 'sending')
    }

    // Resolve the From identity. Use the chosen sender; when none was chosen,
    // fall back to the sole sender only if exactly one exists (there is no default
    // sender — multiple senders require an explicit choice at send time).
    // Reply-To defaults to the inbox contact address so replies land in the inbox.
    let sender = email.sender_id ? await marketingSenderService.getById(email.sender_id) : null
    if (!sender && !email.sender_id) {
      const activeSenders = await marketingSenderService.list()
      if (activeSenders.length === 1 && activeSenders[0]) sender = activeSenders[0]
    }
    const from = sender ? (buildMarketingFrom(sender.name, sender.local_part) ?? undefined) : undefined
    const replyTo = sender?.reply_to || config.inboxContactAddress || undefined

    cached = { email, text: tiptapToText(email.content_json), from, replyTo }
    emailCache.set(payload.marketing_email_id, cached)

    setTimeout(() => emailCache.delete(payload.marketing_email_id), 5 * 60 * 1000)
  }

  // Safety net for consent revoked after this job was enqueued: if the recipient
  // unsubscribed (or otherwise opted out of this audience) while the campaign was
  // draining, drop the send instead of mailing them — mirrors the suppression net
  // above. Skipped for 'pick' (testing override that deliberately bypasses consent)
  // and 'admins' (internal recipients, contact_method_id 0 / no consent row).
  const audienceType = cached.email.audience_type
  if (audienceType !== 'pick' && audienceType !== 'admins') {
    const stillConsented = await contactMethodService.stillConsentsToAudience(
      payload.contact_method_id,
      audienceType,
      cached.email.people_group_id
    )
    if (!stillConsented) {
      return { success: true, data: { skipped: 'unsubscribed' } }
    }
  }

  let subscriber = await subscriberService.getSubscriberByContactMethodId(payload.contact_method_id)
  // The admins test audience has no contact_method (id 0); resolve by recipient
  // email instead so a test send still gets a working personalized link when
  // the recipient is also a subscriber.
  if (!subscriber && payload.recipient_email) {
    const contact = await contactMethodService.getByValue('email', payload.recipient_email)
    if (contact?.subscriber_id) subscriber = await subscriberService.getSubscriberById(contact.subscriber_id)
  }
  const profileId = subscriber?.profile_id || 'unknown'
  const subscriberLanguage = subscriber?.preferred_language || 'en'

  // Resolve which consent this email's unsubscribe targets, then build both the
  // human-facing preferences page (body link) and the RFC 8058 one-click endpoint
  // (List-Unsubscribe header) from the same params so they stay in sync.
  let unsubQuery: string
  if (cached.email.audience_type === 'people_group' && cached.email.people_group_slug) {
    unsubQuery = `id=${profileId}&type=people_group&slug=${cached.email.people_group_slug}`
  } else if (cached.email.audience_type === 'active_pg') {
    // The all-active-subscribers audience carries product/feedback emails (surveys,
    // evaluations), so its opt-out targets the product-emails consent category.
    unsubQuery = `id=${profileId}&type=product`
  } else {
    unsubQuery = `id=${profileId}&type=doxa`
  }
  // Attribute the opt-out back to this email so its unsubscribe_count can be
  // tallied when the recipient actually unsubscribes (via either path).
  unsubQuery += `&me=${payload.marketing_email_id}`
  const unsubscribeUrl = `${baseUrl}${localePath('/unsubscribe', subscriberLanguage)}?${unsubQuery}`
  const listUnsubscribeUrl = `${baseUrl}/api/marketing/unsubscribe?${unsubQuery}`

  const template = getMarketingTemplate(cached.email.template)

  let html: string
  let subject: string
  let text: string

  if (template) {
    // Templated emails render per-recipient in the subscriber's language and
    // carry a personalized survey link; the stored subject/content are unused.
    const surveyUrl = `${baseUrl}${localePath('/survey', subscriberLanguage)}?id=${profileId}`
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
    text,
    listUnsubscribeUrl
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
