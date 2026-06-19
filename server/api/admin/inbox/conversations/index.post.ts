import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { jobQueueService, type OutboundEmailPayload } from '#server/database/job-queue'
import { userService } from '#server/database/users'
import { handleApiError } from '#server/utils/api-helpers'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Start a new conversation with a first outbound message (requires inbox.send).
 *
 * Unlike replying (conversations/[id]/messages), this creates the conversation. Two modes:
 *  - subscriber_id  → email an existing contact (recipient = their primary email)
 *  - to_email       → email a new/arbitrary address (find-or-create the subscriber by email)
 *
 * Body: { to_email?, subscriber_id?, to_name?, subject, body_html, body_text?, from_identity? }
 *  - from_identity: 'personal' (sender's alias) | 'contact' (general address); defaults to
 *    'personal' when the sender has an alias, otherwise 'contact'.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'inbox.send')

  const body = await readBody<{
    to_email?: string
    subscriber_id?: number
    to_name?: string
    subject?: string
    body_html?: string
    body_text?: string
    from_identity?: 'personal' | 'contact'
  }>(event)

  const subject = (body.subject || '').trim()
  const bodyHtml = (body.body_html || '').trim()
  const bodyText = body.body_text ?? null

  if (!subject) {
    throw createError({ statusCode: 400, statusMessage: 'Subject is required' })
  }
  if (!bodyHtml) {
    throw createError({ statusCode: 400, statusMessage: 'Message body is required' })
  }

  try {
    // --- Resolve the subscriber + recipient address ---
    let subscriberId: number
    let recipientEmail: string | null

    if (body.subscriber_id) {
      const subscriber = await subscriberService.getSubscriberById(body.subscriber_id)
      if (!subscriber) {
        throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
      }
      subscriberId = subscriber.id
      recipientEmail = (await contactMethodService.getPrimaryEmail(subscriberId))?.value ?? null
      if (!recipientEmail) {
        throw createError({ statusCode: 400, statusMessage: 'Contact has no email address' })
      }
    } else if (body.to_email) {
      const toEmail = body.to_email.trim()
      if (!EMAIL_RE.test(toEmail)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
      }
      const { subscriber, isNew } = await subscriberService.findOrCreateSubscriber({
        email: toEmail,
        name: body.to_name?.trim() || toEmail,
      })
      await subscriberService.addSource(subscriber.id, 'inbox')
      // Log creation so a contact first reached via a new email has the same "Created"
      // activity trail as one created through the contact form or signup.
      if (isNew) {
        logCreate('subscribers', String(subscriber.id), event, {
          source: 'Inbox',
          message: 'Created via new email',
        })
      }
      subscriberId = subscriber.id
      recipientEmail = toEmail
    } else {
      throw createError({ statusCode: 400, statusMessage: 'A recipient is required' })
    }

    // --- Resolve the chosen From address (mirrors conversations/[id]/messages) ---
    const config = useRuntimeConfig()
    const contactAddress = config.inboxContactAddress || 'contact@doxa.life'
    const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
    const sender = await userService.getUserById(auth.userId)
    const useContact = body.from_identity === 'contact' || !sender?.email_alias
    const fromEmail = useContact ? contactAddress : `${sender!.email_alias}@${inboxDomain}`

    // --- Create the conversation, assigned to the sender + Pending (as a sent reply does) ---
    const conversation = await conversationService.create({
      subscriber_id: subscriberId,
      subject,
      status: 'pending',
      assigned_user_id: auth.userId,
      source: 'staff',
    })
    // Log creation before the message is queued, so the conversation keeps a full origin
    // trail (source + the address it was sent to) even if a later step fails.
    logCreate('conversations', String(conversation.id), event, {
      message: 'New email queued',
      source: 'staff',
      received_on: recipientEmail,
      direction: 'outbound',
    })

    // Personal signature only when sending as the agent's own alias.
    const html = withSignature(bodyHtml, useContact ? null : sender)
    const message = await messageService.create({
      conversation_id: conversation.id,
      direction: 'outbound',
      status: 'queued',
      sender_user_id: auth.userId,
      from_email: fromEmail,
      to_email: recipientEmail,
      subject,
      body_html: html,
      body_text: bodyText,
    })

    await conversationService.touchLastMessage(conversation.id, new Date().toISOString(), 'outbound')

    const payload: OutboundEmailPayload = { message_id: message.id }
    await jobQueueService.createJob('outbound_email', payload, {
      referenceType: 'conversation',
      referenceId: conversation.id,
    })

    return { conversation, message, queued: true }
  } catch (error) {
    handleApiError(error, 'Failed to start conversation')
  }
})

function withSignature(html: string, sender: { email_signature?: string | null } | null): string {
  if (sender?.email_signature) {
    return `${html}<br><br>${sender.email_signature}`
  }
  return html
}
