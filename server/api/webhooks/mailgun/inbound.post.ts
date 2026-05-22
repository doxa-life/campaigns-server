import { conversationService, type Conversation } from '../../../database/conversations'
import { messageService } from '../../../database/conversation-messages'
import { conversationAttachmentService } from '../../../database/conversation-attachments'
import { spamSenderService } from '../../../database/spam-senders'
import { subscriberService } from '../../../database/subscribers'
import { contactMethodService } from '../../../database/contact-methods'
import { userService } from '../../../database/users'
import { validateMailgunWebhook } from '../../../utils/mailgun-webhook'
import {
  parseMessageHeaders,
  parseAuthentication,
  parseSpamScore,
  extractEmailAddress,
  extractDisplayName,
  isAutoResponderOrBounce,
} from '../../../utils/mailgun-inbound'
import { parseInboxRecipient, buildContactReplyAddress, buildFromAddress } from '../../../utils/inbox-addressing'
import { resolveSignedStaffSender } from '../../../utils/inbox-reply-auth'
import { inboxEmailService } from '../../../utils/inbox-email'
import { notifyNewConversation, notifyAssignee, notifyHeldSender } from '../../../utils/inbox-notification-email'
import { sendInboxAutoAck } from '../../../utils/inbox-auto-ack-email'

// Transient failures bubble up as this so the catch can return a retryable 5xx.
class TransientError extends Error {}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // --- Read payload (multipart or urlencoded) ---
  let form: FormData
  try {
    form = await readFormData(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Malformed payload' })
  }
  const field = (name: string): string | null => {
    const v = form.get(name)
    return typeof v === 'string' ? v : null
  }

  // --- 1. Verify Mailgun webhook signature (skipped in tests unless explicitly exercised) ---
  const enforceSignature = !process.env.VITEST || field('x-test-verify-sig') === '1'
  if (enforceSignature) {
    const result = validateMailgunWebhook(
      { timestamp: field('timestamp') || '', token: field('token') || '', signature: field('signature') || '' },
      config.mailgunWebhookSigningKey
    )
    if (!result.ok) {
      throw createError({ statusCode: 406, statusMessage: result.reason || 'Invalid signature' })
    }
  }

  // --- Gather fields ---
  const recipient = field('recipient') || ''
  const fromHeaderRaw = field('from') || field('sender') || ''
  const fromEmail = extractEmailAddress(fromHeaderRaw)
  const fromName = extractDisplayName(fromHeaderRaw)
  const subject = field('subject') || ''
  const bodyHtml = field('body-html') || ''
  const bodyStrippedHtml = field('stripped-html') || ''
  const bodyText = field('stripped-text') || field('body-plain') || ''

  if (!recipient || !fromEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Missing recipient or sender' })
  }

  const headers = parseMessageHeaders(field('message-headers'))
  const messageId = headers.get('message-id') || field('Message-Id') || null
  const inReplyTo = headers.get('in-reply-to') || null
  const references = headers.get('references') || null
  const auth = parseAuthentication(headers, fromEmail)
  const spamScore = parseSpamScore(headers, Object.fromEntries(form.entries()))

  const parsedRecipient = parseInboxRecipient(recipient)
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const domainMatches = parsedRecipient?.domain === inboxDomain

  // --- 2. Idempotency by Message-Id ---
  if (messageId) {
    const existing = await messageService.findByEmailMessageId(messageId)
    if (existing) {
      return { status: 'duplicate', message_id: existing.id }
    }
  }

  // Everything below must be durable before we 200. Transient DB/S3 errors → retryable 5xx.
  try {
    if (process.env.VITEST && field('x-test-fail') === 'db') {
      throw new TransientError('Simulated transient persistence failure')
    }

    // --- 3. Spam blocklist: attach + auto-close, stop ---
    if (await spamSenderService.isBlocked(fromEmail)) {
      const { subscriber } = await subscriberService.findOrCreateSubscriber({ email: fromEmail, name: fromName || fromEmail })
      await subscriberService.addSource(subscriber.id, 'inbox')
      const convo = await conversationService.create({
        subscriber_id: subscriber.id,
        subject: subject || null,
        status: 'spam',
      })
      await messageService.create({
        conversation_id: convo.id,
        direction: 'inbound',
        status: 'received',
        from_email: fromEmail,
        from_name: fromName,
        to_email: recipient,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        email_message_id: messageId,
        in_reply_to: inReplyTo,
        email_references: references,
        spam_score: spamScore,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
      })
      await conversationService.closeForSubscriberAsSpam(subscriber.id)
      return { status: 'spam', conversation_id: convo.id }
    }

    // --- 4. Resolve conversation ---
    let conversation: Conversation | null = null
    let aliasUser: Awaited<ReturnType<typeof userService.getByEmailAlias>> = null

    if (domainMatches && parsedRecipient) {
      if (parsedRecipient.token) {
        conversation = await conversationService.findByReplyToken(parsedRecipient.token)
      }
      if (!conversation && (inReplyTo || references)) {
        const ids = [inReplyTo, ...(references ? references.split(/\s+/) : [])].filter(Boolean) as string[]
        const convoId = await messageService.findConversationByMessageIds(ids)
        if (convoId) conversation = await conversationService.getById(convoId)
      }
      if (!conversation && !parsedRecipient.token) {
        const contactBase = (config.inboxContactAddress || 'contact@doxa.life').split('@')[0]!.toLowerCase()
        if (parsedRecipient.base && parsedRecipient.base !== contactBase) {
          aliasUser = await userService.getByEmailAlias(parsedRecipient.base)
        }
      }
    }

    const isNewConversation = !conversation
    let subscriberIdForNew: number | null = null

    if (!conversation) {
      const { subscriber } = await subscriberService.findOrCreateSubscriber({ email: fromEmail, name: fromName || fromEmail })
      await subscriberService.addSource(subscriber.id, 'inbox')
      subscriberIdForNew = subscriber.id
      conversation = await conversationService.create({
        subscriber_id: subscriber.id,
        subject: subject || null,
        status: 'open',
        assigned_user_id: aliasUser?.id ?? null,
      })
    }

    // --- 5. Determine direction (never trust From alone) ---
    const staffUser = parsedRecipient?.sig
      ? await resolveSignedStaffSender({
          conversationId: conversation.id,
          exp: parsedRecipient.exp,
          sig: parsedRecipient.sig,
          secret: config.inboxReplySecret || config.jwtSecret || '',
        })
      : null

    // Does the sender match the conversation's contact (subscriber email)?
    let senderIsContact = isNewConversation
    let contactMethodId: number | null = null
    if (!isNewConversation && conversation.subscriber_id) {
      const cm = await contactMethodService.getByValue('email', fromEmail)
      if (cm && cm.subscriber_id === conversation.subscriber_id) {
        senderIsContact = true
        contactMethodId = cm.id
      }
    } else if (isNewConversation) {
      const cm = await contactMethodService.getByValue('email', fromEmail)
      contactMethodId = cm?.id ?? null
    }

    let outcome: 'staff' | 'contact' | 'held'
    if (staffUser && auth.authenticated) {
      outcome = 'staff'
    } else if (senderIsContact && !parsedRecipient?.sig) {
      outcome = 'contact'
    } else {
      // Unknown sender, invalid/expired sig, or unauthenticated staff attempt
      outcome = 'held'
    }

    let storedMessage

    if (outcome === 'staff') {
      // Record the staff reply as outbound and forward it onward to the contact.
      const contactEmail = conversation.subscriber_id
        ? (await contactMethodService.getPrimaryEmail(conversation.subscriber_id))?.value || null
        : null
      const lastInbound = await messageService.getLastInbound(conversation.id)

      let providerMessageId: string | undefined
      if (contactEmail) {
        const fromAddress = buildFromAddress({
          firstName: staffUser!.display_name,
          alias: staffUser!.email_alias,
          domain: inboxDomain,
          contactAddress: config.inboxContactAddress || 'contact@doxa.life',
        })
        const sent = await inboxEmailService.send({
          from: fromAddress,
          to: contactEmail,
          subject: subject || conversation.subject || 'Re:',
          html: bodyHtml || bodyStrippedHtml,
          text: bodyText,
          replyTo: buildContactReplyAddress(conversation.reply_token, config.inboxContactAddress || 'contact@doxa.life'),
          inReplyTo: lastInbound?.email_message_id || undefined,
          references: lastInbound?.email_message_id || undefined,
        })
        providerMessageId = sent.providerMessageId
      }

      storedMessage = await messageService.create({
        conversation_id: conversation.id,
        direction: 'outbound',
        status: 'sent',
        sender_user_id: staffUser!.id,
        from_email: staffUser!.email_alias ? `${staffUser!.email_alias}@${inboxDomain}` : (config.inboxContactAddress || 'contact@doxa.life'),
        from_name: staffUser!.display_name,
        to_email: contactEmail,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        email_message_id: providerMessageId || messageId,
        in_reply_to: inReplyTo,
        email_references: references,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
      })
      await conversationService.updateStatus(conversation.id, 'pending')
      await conversationService.assignIfUnassigned(conversation.id, staffUser!.id)
      await conversationService.touchLastMessage(conversation.id, storedMessage.created_at, 'outbound')
    } else if (outcome === 'contact') {
      storedMessage = await messageService.create({
        conversation_id: conversation.id,
        direction: 'inbound',
        status: 'received',
        from_email: fromEmail,
        from_name: fromName,
        to_email: recipient,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        email_message_id: messageId,
        in_reply_to: inReplyTo,
        email_references: references,
        spam_score: spamScore,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
      })
      // Reopen a closed conversation on new inbound
      if (conversation.status === 'closed') {
        await conversationService.updateStatus(conversation.id, 'open')
      }
      await conversationService.touchLastMessage(conversation.id, storedMessage.created_at, 'inbound')
      if (subject) await conversationService.setSubject(conversation.id, subject)

      // Authenticated inbound proves ownership → mark the contact method verified
      if (auth.authenticated && contactMethodId) {
        await contactMethodService.markVerified(contactMethodId)
      }
    } else {
      // held
      storedMessage = await messageService.create({
        conversation_id: conversation.id,
        direction: 'inbound',
        status: 'held',
        from_email: fromEmail,
        from_name: fromName,
        to_email: recipient,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        email_message_id: messageId,
        in_reply_to: inReplyTo,
        email_references: references,
        spam_score: spamScore,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
        hold_reason: staffUser ? 'Unauthenticated staff reply' : 'Unknown sender',
      })
      await conversationService.setNeedsReview(conversation.id, true)
      await conversationService.touchLastMessage(conversation.id, storedMessage.created_at, 'inbound')
    }

    // --- 7. Attachments + raw MIME → S3 (skipped in tests) ---
    if (!process.env.VITEST) {
      try {
        await persistAttachments(form, storedMessage.id)
        const rawMime = field('body-mime')
        if (rawMime) {
          const upload = await uploadToS3(Buffer.from(rawMime, 'utf-8'), `raw-${storedMessage.id}.eml`, 'message/rfc822')
          await sql`UPDATE conversation_messages SET raw_s3_key = ${upload.key} WHERE id = ${storedMessage.id}`
        }
      } catch (s3err: any) {
        // Attachment/raw persistence failure is transient — force a retry so nothing is lost.
        throw new TransientError(s3err?.message || 'Attachment persistence failed')
      }
    }

    logCreate('conversations', String(conversation.id), undefined, {
      message: `Inbound email (${outcome})`,
      direction: outcome === 'staff' ? 'outbound' : 'inbound',
      authenticated: auth.authenticated,
    })

    // --- 8. Notify (after durable persist; failures don't fail the request) ---
    try {
      if (outcome === 'held') {
        await notifyNewConversation(conversation, storedMessage, { held: true })
        await notifyHeldSender(fromEmail)
      } else if (outcome === 'contact') {
        if (conversation.assigned_user_id) {
          await notifyAssignee(conversation, storedMessage)
        } else {
          await notifyNewConversation(conversation, storedMessage)
        }
        // Auto-ack only for brand-new cold conversations (not for ongoing replies)
        if (isNewConversation && !isAutoResponderOrBounce(headers, fromEmail)) {
          await sendInboxAutoAck({ to: fromEmail, name: fromName, language: 'en', replyToken: conversation.reply_token })
        }
      }
    } catch (notifyErr: any) {
      console.error('[InboundWebhook] Notification failed:', notifyErr?.message || notifyErr)
    }

    return { status: outcome, conversation_id: conversation.id, message_id: storedMessage.id }
  } catch (error: any) {
    if (error instanceof TransientError) {
      throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
    }
    // Unknown errors are treated as transient too, so Mailgun retries rather than dropping mail.
    console.error('[InboundWebhook] Persistence error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})

async function persistAttachments(form: FormData, messageId: number): Promise<void> {
  const blocked = /\.(exe|bat|cmd|com|scr|js|jar|vbs|ps1|sh|msi|dll)$/i
  for (const [, value] of form.entries()) {
    if (typeof value === 'string') continue
    const file = value as File
    if (!file.name) continue
    if (blocked.test(file.name)) continue
    if (file.size > 25 * 1024 * 1024) continue
    const buffer = Buffer.from(await file.arrayBuffer())
    const upload = await uploadToS3(buffer, file.name, file.type || 'application/octet-stream')
    await conversationAttachmentService.create({
      message_id: messageId,
      s3_key: upload.key,
      filename: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    })
  }
}
