import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { spamSenderService } from '#server/database/spam-senders'
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { roleService } from '#server/database/roles'
import { userService } from '#server/database/users'
import { notificationRecipientService } from '#server/database/notification-recipients'
import { inboxEmailService } from '#server/utils/inbox-email'
import {
  createSignedReplyAddress,
  extractMessageIds,
  htmlToText,
  isAutoResponder,
  parseAddress,
  parseInboundAuthentication,
  parseReplyAddress,
  stripQuotedHtml,
  verifyMailgunSignature,
  verifyStaffReplySignature
} from '#server/utils/inbox-mailgun'
import { sendInboxAutoAckEmail } from '#server/utils/inbox-auto-ack-email'
import { storeInboxAttachment, storeRawInboundMime } from '#server/utils/inbox-attachments'

type MailgunPayload = Record<string, any>

async function readMailgunPayload(event: any): Promise<{ fields: MailgunPayload; files: any[] }> {
  const contentType = getHeader(event, 'content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event)
    const fields: MailgunPayload = {}
    const files: any[] = []
    for (const part of parts || []) {
      if (part.filename) files.push(part)
      else fields[part.name || ''] = part.data?.toString('utf8') || ''
    }
    return { fields, files }
  }
  return { fields: await readBody(event), files: [] }
}

function getField(fields: MailgunPayload, ...names: string[]) {
  for (const name of names) {
    const value = fields[name]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

function parseHeaders(fields: MailgunPayload) {
  const raw = getField(fields, 'message-headers', 'headers')
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(([k, v]) => `${k}: ${v}`).join('\n')
  } catch {}
  return raw
}

function rawMimeForStorage(fields: MailgunPayload, headers: string) {
  return getField(fields, 'body-mime', 'message') || JSON.stringify({
    headers,
    fields: Object.fromEntries(Object.entries(fields).filter(([key]) => !['token', 'signature'].includes(key)))
  }, null, 2)
}

function headerValue(headers: string, name: string) {
  const line = headers.split(/\r?\n/).find(h => h.toLowerCase().startsWith(`${name.toLowerCase()}:`))
  return line ? line.slice(name.length + 1).trim() : ''
}

async function notifyRecipients(conversation: any, subject: string, preview: string) {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl || 'http://localhost:3000'
  const secret = String(config.mailgunWebhookSigningKey || config.jwtSecret || '')
  const inboxDomain = String(config.inboxDomain || 'doxa.life')
  const url = `${siteUrl}/admin/inbox/${conversation.id}`

  let recipients: Array<{ email: string; user_id?: string | null }> = []
  if (conversation.assigned_user_id) {
    const user = await userService.getUserById(conversation.assigned_user_id)
    if (user) recipients = [{ email: user.email, user_id: user.id }]
  } else {
    recipients = (await notificationRecipientService.getByGroup('contact_us')).map((r: any) => ({ email: r.email, user_id: r.user_id || null }))
  }

  await Promise.allSettled(recipients.map(async (recipient) => {
    if (!recipient.email) return
    const replyTo = recipient.user_id && secret
      ? createSignedReplyAddress({ baseToken: conversation.reply_token, userId: recipient.user_id, conversationId: conversation.id, inboxDomain, secret })
      : `contact+${conversation.reply_token}@${inboxDomain}`

    await inboxEmailService.send({
      from: String(config.inboxContactAddress || `contact@${inboxDomain}`),
      fromName: 'Doxa Inbox',
      to: recipient.email,
      subject: `Inbox: ${subject || 'New message'}`,
      html: `<p>${preview.replace(/</g, '&lt;')}</p><p><a href="${url}">Open conversation</a></p>`,
      text: `${preview}\n\nOpen conversation: ${url}`,
      replyTo
    })
  }))
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { fields, files } = await readMailgunPayload(event)
  const signingKey = String(config.mailgunWebhookSigningKey || '')

  const signatureOk = verifyMailgunSignature({
    timestamp: getField(fields, 'timestamp'),
    token: getField(fields, 'token'),
    signature: getField(fields, 'signature'),
    signingKey
  })
  if (!signatureOk) {
    throw createError({ statusCode: 406, statusMessage: 'Invalid Mailgun signature' })
  }

  const sender = parseAddress(getField(fields, 'sender', 'from', 'From'))
  const recipient = parseAddress(getField(fields, 'recipient', 'to', 'To'))
  if (!sender || !recipient) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sender or recipient' })
  }

  const subject = getField(fields, 'subject', 'Subject') || '(no subject)'
  const bodyHtml = getField(fields, 'body-html', 'stripped-html')
  const strippedHtml = getField(fields, 'stripped-html') || stripQuotedHtml(bodyHtml) || null
  const bodyText = getField(fields, 'stripped-text', 'body-plain') || htmlToText(strippedHtml || bodyHtml)
  const messageId = getField(fields, 'Message-Id', 'message-id', 'Message-ID') || headerValue(parseHeaders(fields), 'Message-Id')
  const inReplyTo = getField(fields, 'In-Reply-To', 'in-reply-to') || headerValue(parseHeaders(fields), 'In-Reply-To')
  const references = getField(fields, 'References', 'references') || headerValue(parseHeaders(fields), 'References')
  const headers = parseHeaders(fields)
  const auth = parseInboundAuthentication(headers, sender.email)
  const inboxDomain = String(config.inboxDomain || 'doxa.life').toLowerCase()

  try {
    if (messageId && await messageService.findByEmailMessageId(messageId)) {
      return { ok: true, duplicate: true }
    }

    const replyAddress = parseReplyAddress(recipient.email, inboxDomain)
    let conversation = replyAddress ? await conversationService.findByReplyToken(replyAddress.token) : null
    if (!conversation) {
      conversation = await conversationService.findByThreadHeader([
        ...extractMessageIds(inReplyTo),
        ...extractMessageIds(references)
      ])
    }

    let assignedUserId: string | null = null
    if (!conversation) {
      const aliasUser = await conversationService.findUserByEmailAlias(recipient.localPart, recipient.domain, inboxDomain)
      assignedUserId = aliasUser?.id || null
    }

    const { subscriber } = await subscriberService.findOrCreateSubscriber({
      email: sender.email,
      name: sender.name || sender.email,
      language: 'en'
    })
    await subscriberService.addSource(subscriber.id, 'inbox')

    if (!conversation) {
      conversation = await conversationService.create({
        subscriber_id: subscriber.id,
        subject,
        assigned_user_id: assignedUserId,
        status: 'open'
      })
    }

    const blocked = await spamSenderService.isBlocked(sender.email)
    if (blocked) {
      const msg = await messageService.create({
        conversation_id: conversation.id,
        direction: 'inbound',
        status: 'received',
        from_email: sender.email,
        from_name: sender.name,
        to_email: recipient.email,
        subject,
        body_html: bodyHtml,
        body_stripped_html: strippedHtml,
        body_text: bodyText,
        email_message_id: messageId || null,
        in_reply_to: inReplyTo || null,
        email_references: references || null,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
        spam_score: getField(fields, 'X-Mailgun-Sscore', 'spam-score') || null
      })
      const rawKey = await storeRawInboundMime(msg.id, rawMimeForStorage(fields, headers))
      if (rawKey) await messageService.updateRawS3Key(msg.id, rawKey)
      await conversationService.touchLastMessage(conversation.id, 'inbound', 'spam')
      return { ok: true, message_id: msg.id, spam: true }
    }

    const staffSig = verifyStaffReplySignature(replyAddress?.signedPart || null, conversation.id, String(config.mailgunWebhookSigningKey || config.jwtSecret || ''))
    const staffCanSend = staffSig ? await roleService.userHasPermission(staffSig.userId, 'inbox.send') : false
    const isStaffSend = !!staffSig && staffCanSend && auth.authenticated

    if (isStaffSend) {
      const user = await userService.getUserById(staffSig!.userId)
      const contactEmail = await contactMethodService.getPrimaryEmail(conversation.subscriber_id!)
      if (!user || !contactEmail) {
        throw createError({ statusCode: 400, statusMessage: 'Conversation sender or contact is missing' })
      }

      const fromAlias = user.email_alias ? `${user.email_alias}@${inboxDomain}` : String(config.inboxContactAddress || `contact@${inboxDomain}`)
      const providerMessageId = await inboxEmailService.send({
        from: fromAlias,
        fromName: user.display_name ? `${user.display_name} with Doxa` : 'Doxa Prayer',
        to: contactEmail.value,
        subject,
        html: bodyHtml,
        text: bodyText,
        replyTo: `contact+${conversation.reply_token}@${inboxDomain}`,
        inReplyTo,
        references
      })

      const msg = await messageService.create({
        conversation_id: conversation.id,
        direction: 'outbound',
        status: providerMessageId ? 'sent' : 'queued',
        sender_user_id: user.id,
        from_email: fromAlias,
        from_name: user.display_name,
        to_email: contactEmail.value,
        subject,
        body_html: bodyHtml,
        body_stripped_html: strippedHtml,
        body_text: bodyText,
        email_message_id: messageId || null,
        provider_message_id: providerMessageId,
        authenticated: auth.authenticated,
        auth_result: auth.authResult
      })
      const rawKey = await storeRawInboundMime(msg.id, rawMimeForStorage(fields, headers))
      if (rawKey) await messageService.updateRawS3Key(msg.id, rawKey)
      if (!conversation.assigned_user_id) await conversationService.assign(conversation.id, user.id)
      await conversationService.touchLastMessage(conversation.id, 'outbound', 'pending')
      return { ok: true, message_id: msg.id, forwarded: true }
    }

    const primaryEmail = conversation.subscriber_id ? await contactMethodService.getPrimaryEmail(conversation.subscriber_id) : null
    const contactInbound = primaryEmail?.value?.toLowerCase() === sender.email.toLowerCase()
    const shouldHold = !contactInbound && !!replyAddress
    const holdReason = shouldHold
      ? (!replyAddress?.signedPart ? 'missing_staff_signature' : (!auth.authenticated ? 'unauthenticated_staff_reply' : 'sender_not_allowed'))
      : null

    const msg = await messageService.create({
      conversation_id: conversation.id,
      direction: 'inbound',
      status: holdReason ? 'held' : 'received',
      from_email: sender.email,
      from_name: sender.name,
      to_email: recipient.email,
      subject,
      body_html: bodyHtml,
      body_stripped_html: strippedHtml,
      body_text: bodyText,
      email_message_id: messageId || null,
      in_reply_to: inReplyTo || null,
      email_references: references || null,
      authenticated: auth.authenticated,
      auth_result: auth.authResult,
      hold_reason: holdReason,
      spam_score: getField(fields, 'X-Mailgun-Sscore', 'spam-score') || null
    })

    const rawKey = await storeRawInboundMime(msg.id, rawMimeForStorage(fields, headers))
    if (rawKey) await messageService.updateRawS3Key(msg.id, rawKey)

    for (const file of files) {
      await storeInboxAttachment({
        messageId: msg.id,
        filename: file.filename,
        contentType: file.type,
        buffer: Buffer.from(file.data)
      })
    }

    if (holdReason) {
      await conversationService.setNeedsReview(conversation.id, true)
      await inboxEmailService.send({
        from: String(config.inboxContactAddress || `contact@${inboxDomain}`),
        fromName: 'Doxa Inbox',
        to: sender.email,
        subject: 'Please log in to resolve this reply',
        html: '<p>We could not verify this email reply. Please log in to Doxa and resolve it from the held inbox.</p>',
        text: 'We could not verify this email reply. Please log in to Doxa and resolve it from the held inbox.'
      })
    } else {
      if (auth.authenticated) await contactMethodService.verifyByValue('email', sender.email)
      const status = conversation.status === 'closed' ? 'open' : 'open'
      await conversationService.touchLastMessage(conversation.id, 'inbound', status)
      await notifyRecipients(conversation, subject, bodyText)
      if (!isAutoResponder({ fromEmail: sender.email, headers }) && !replyAddress) {
        await sendInboxAutoAckEmail({
          to: sender.email,
          language: 'en',
          replyTo: `contact+${conversation.reply_token}@${inboxDomain}`
        })
      }
    }

    return { ok: true, message_id: msg.id }
  } catch (error: any) {
    if (error?.statusCode && error.statusCode < 500) throw error
    console.error('Mailgun inbound persistence failed:', error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary inbound persistence failure' })
  }
})
