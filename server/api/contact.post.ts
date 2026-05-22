import { subscriberService } from '../database/subscribers'
import { contactMethodService } from '../database/contact-methods'
import { conversationService } from '../database/conversations'
import { messageService } from '../database/conversation-messages'
import { requireFormApiKey } from '../utils/form-api-key'
import { handleApiError } from '#server/utils/api-helpers'
import { jobQueueService, type InboxEmailPayload } from '../database/job-queue'
import { sendContactVerificationEmail } from '../utils/contact-verification-email'
import countries from 'i18n-iso-countries'
import { trackEventInBackground, userHashFromEmail } from '../utils/tracking'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody<{
    name?: string
    email: string
    message: string
    country?: string
    consent_doxa_general?: boolean
    language?: string
  }>(event)

  const language = body.language?.trim() || 'en'
  const name = body.name?.trim() || ''
  const email = body.email?.trim().toLowerCase()
  const message = body.message?.trim()
  const rawCountry = body.country?.trim().toUpperCase() || null
  const country = rawCountry
    ? (rawCountry.length === 3 ? countries.alpha3ToAlpha2(rawCountry) : rawCountry) || null
    : null

  if (!email || !message) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: email, message' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  try {
    const { subscriber, isNew } = await subscriberService.findOrCreateSubscriber({
      email,
      name: name || email,
      country,
    })

    if (!isNew && country && subscriber.country !== country) {
      await subscriberService.updateSubscriber(subscriber.id, { country })
    }

    await subscriberService.addSource(subscriber.id, 'contact')

    if (body.consent_doxa_general) {
      const emailContact = await contactMethodService.getByValue('email', email)
      if (emailContact) {
        await contactMethodService.updateDoxaConsent(emailContact.id, true)

        if (!emailContact.verified) {
          const token = await contactMethodService.generateVerificationToken(emailContact.id)
          sendContactVerificationEmail(email, token, name || email, language)
            .catch(err => console.error('Failed to send contact verification email:', err))
        }
      }
    }

    logCreate('subscribers', String(subscriber.id), event, {
      source: 'Contact Form',
      message: 'Contact form submitted',
      form_values: { name, email, message, country, consent_doxa_general: body.consent_doxa_general ?? false },
    })

    // Open a conversation in the shared inbox with the form message as the first inbound message.
    const subject = (message.split('\n')[0] || 'Contact form message').slice(0, 120)
    const conversation = await conversationService.create({
      subscriber_id: subscriber.id,
      subject,
      status: 'open',
    })
    const firstMessage = await messageService.create({
      conversation_id: conversation.id,
      direction: 'inbound',
      status: 'received',
      from_email: email,
      from_name: name || email,
      to_email: useRuntimeConfig().inboxContactAddress || 'contact@doxa.life',
      subject,
      body_html: `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      body_text: message,
    })
    await conversationService.touchLastMessage(conversation.id, firstMessage.created_at, 'inbound')
    logCreate('conversations', String(conversation.id), event, { message: 'Contact form conversation opened', direction: 'inbound' })

    // Auto-ack (in the form's language) and the staff notification go through the job
    // queue so a transient send failure is retried instead of silently lost.
    try {
      await jobQueueService.createJob<InboxEmailPayload>('inbox_email', {
        kind: 'auto_ack',
        conversation_id: conversation.id,
        to: email,
        name: name || null,
        language,
      }, { referenceType: 'conversation', referenceId: conversation.id })
      await jobQueueService.createJob<InboxEmailPayload>('inbox_email', {
        kind: 'new_conversation',
        conversation_id: conversation.id,
        message_id: firstMessage.id,
      }, { referenceType: 'conversation', referenceId: conversation.id })
    } catch (err) {
      console.error('Failed to enqueue inbox emails:', err)
    }

    trackEventInBackground(event, {
      eventType: 'contact_form_submitted',
      anonymousHash: subscriber.tracking_id,
      userHash: userHashFromEmail(email),
      language,
      metadata: {
        source: 'contact_form',
        country,
        consent_doxa_general: body.consent_doxa_general ?? false,
        language
      }
    })

    return { success: true }
  } catch (error: any) {
    handleApiError(error, 'Failed to process contact form', 500)
  }
})
