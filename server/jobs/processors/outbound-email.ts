import type { Job, OutboundEmailPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { messageService } from '../../database/conversation-messages'
import { conversationService } from '../../database/conversations'
import { conversationAttachmentService } from '../../database/conversation-attachments'
import { contactMethodService } from '../../database/contact-methods'
import { userService } from '../../database/users'
import { inboxEmailService, type InboxEmailAttachment } from '../../utils/inbox-email'
import { buildContactReplyAddress, buildFromAddress } from '../../utils/inbox-addressing'

/**
 * Sends a queued outbound inbox message. The generic queue only tracks *job* status;
 * this processor owns the message-level state (sent/failed, provider id, failed reason).
 */
export async function processOutboundEmail(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as OutboundEmailPayload
  const config = useRuntimeConfig()
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'

  const message = await messageService.getById(payload.message_id)
  if (!message) return { success: false, data: { error: 'Message not found' } }
  if (message.status !== 'queued') {
    // Already handled (e.g. retried after success) — nothing to do.
    return { success: true, data: { skipped: message.status } }
  }

  const conversation = await conversationService.getById(message.conversation_id)
  if (!conversation || !conversation.subscriber_id) {
    await messageService.markStatus(message.id, 'failed', { failed_reason: 'Conversation or subscriber missing' })
    return { success: false, data: { error: 'Conversation or subscriber missing' } }
  }

  const contact = await contactMethodService.getPrimaryEmail(conversation.subscriber_id)
  if (!contact?.value) {
    await messageService.markStatus(message.id, 'failed', { failed_reason: 'No contact email' })
    return { success: false, data: { error: 'No contact email' } }
  }

  const sender = message.sender_user_id ? await userService.getUserById(message.sender_user_id) : null
  // Honor the From identity chosen at compose time (stored on the message's from_email):
  // the general contact address, or the sender's personal alias. Falls back to the
  // sender's alias when unset (e.g. reply-by-email).
  const useContact = (message.from_email || '').toLowerCase() === contactAddress.toLowerCase()
  let fromAddress: string
  if (useContact) {
    fromAddress = `"Doxa Prayer" <${contactAddress}>`
  } else if (message.from_email) {
    const first = (sender?.display_name || '').trim().split(/\s+/)[0] || 'Doxa'
    fromAddress = `"${first} with Doxa" <${message.from_email}>`
  } else {
    fromAddress = buildFromAddress({
      firstName: sender?.display_name,
      alias: sender?.email_alias,
      domain: inboxDomain,
      contactAddress,
    })
  }

  const lastInbound = await messageService.getLastInbound(conversation.id)

  // Build a quoted history of the prior thread so the recipient's email has context
  // (the in-app thread shows messages individually, so we quote only on the sent copy).
  const prior = (await messageService.listForConversation(conversation.id)).filter(m => m.id !== message.id)
  const quotedHtml = buildQuotedHtml(prior)
  const quotedText = buildQuotedText(prior)
  const html = (message.body_html || '') + quotedHtml
  const text = (message.body_text || '') + quotedText

  // Re-attach any files linked to this outbound message
  const attachments: InboxEmailAttachment[] = []
  if (!process.env.VITEST) {
    const rows = await conversationAttachmentService.listForMessage(message.id)
    for (const row of rows) {
      try {
        const url = await generateSignedUrl(row.s3_key)
        const res = await fetch(url)
        if (res.ok) {
          attachments.push({
            filename: row.filename || 'attachment',
            contentType: row.content_type || 'application/octet-stream',
            data: Buffer.from(await res.arrayBuffer()),
          })
        }
      } catch (err: any) {
        console.error('[OutboundEmail] Attachment fetch failed:', err?.message || err)
      }
    }
  }

  const result = await inboxEmailService.send({
    from: fromAddress,
    to: contact.value,
    subject: message.subject || conversation.subject || 'Re:',
    html,
    text: text || undefined,
    replyTo: buildContactReplyAddress(conversation.reply_token, contactAddress),
    inReplyTo: lastInbound?.email_message_id || undefined,
    references: lastInbound?.email_message_id || undefined,
    attachments: attachments.length ? attachments : undefined,
  })

  if (result.success) {
    await messageService.markSent(message.id, result.providerMessageId)
    return { success: true }
  }

  await messageService.markStatus(message.id, 'failed', { failed_reason: result.error || 'Send failed' })
  throw new Error(result.error || 'Send failed')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function quoteAuthor(m: { direction: string; sender_name?: string | null; from_name: string | null; from_email: string | null }): string {
  if (m.direction === 'outbound') return m.sender_name || m.from_name || 'Doxa Prayer'
  return m.from_name || m.from_email || 'Contact'
}

// Gmail-style quoted history, newest message on top, each as an attributed blockquote.
function buildQuotedHtml(messages: any[]): string {
  if (messages.length === 0) return ''
  let out = '<br><br>'
  for (const m of [...messages].reverse()) {
    const when = new Date(m.created_at).toUTCString()
    const body = m.body_stripped_html || m.body_html || (m.body_text || '').replace(/\n/g, '<br>')
    out += `<blockquote style="margin:0 0 0 0.8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555;">`
    out += `<div style="font-size:12px;color:#888;margin-bottom:4px;">On ${escapeHtml(when)}, ${escapeHtml(quoteAuthor(m))} wrote:</div>`
    out += body
    out += `</blockquote>`
  }
  return out
}

function buildQuotedText(messages: any[]): string {
  if (messages.length === 0) return ''
  let out = '\n\n'
  for (const m of [...messages].reverse()) {
    const when = new Date(m.created_at).toUTCString()
    const body = m.body_text || (m.body_stripped_html || m.body_html || '').replace(/<[^>]*>/g, '')
    const quoted = body.split('\n').map((l: string) => '> ' + l).join('\n')
    out += `On ${when}, ${quoteAuthor(m)} wrote:\n${quoted}\n\n`
  }
  return out
}
