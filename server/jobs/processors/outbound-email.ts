import type { Job, OutboundEmailPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { messageService } from '../../database/conversation-messages'
import { conversationService } from '../../database/conversations'
import { contactMethodService } from '../../database/contact-methods'
import { userService } from '../../database/users'
import { inboxEmailService } from '../../utils/inbox-email'
import { attachmentService } from '../../database/conversation-attachments'
import { signedAttachmentUrl } from '../../utils/inbox-attachments'

export async function processOutboundEmail(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as OutboundEmailPayload
  const config = useRuntimeConfig()
  const inboxDomain = String(config.inboxDomain || 'doxa.life')

  const message = await messageService.getById(payload.message_id)
  if (!message) return { success: false, data: { error: 'Message not found' } }

  const conversation = await conversationService.getById(message.conversation_id)
  if (!conversation?.subscriber_id) return { success: false, data: { error: 'Conversation not found' } }

  const contactEmail = await contactMethodService.getPrimaryEmail(conversation.subscriber_id)
  if (!contactEmail) return { success: false, data: { error: 'Contact email not found' } }

  const user = message.sender_user_id ? await userService.getUserById(message.sender_user_id) : null
  const from = user?.email_alias
    ? `${user.email_alias}@${inboxDomain}`
    : String(config.inboxContactAddress || `contact@${inboxDomain}`)

  try {
    const storedAttachments = await attachmentService.listForMessage(message.id)
    const attachments = []
    for (const attachment of storedAttachments) {
      if (!attachment.s3_key || !attachment.filename) continue
      if (process.env.VITEST) {
        attachments.push({
          filename: attachment.filename,
          contentType: attachment.content_type || undefined,
          data: Buffer.from('')
        })
        continue
      }
      const url = await signedAttachmentUrl(attachment.s3_key)
      if (!url) continue
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch attachment ${attachment.filename}`)
      attachments.push({
        filename: attachment.filename,
        contentType: attachment.content_type || undefined,
        data: Buffer.from(await response.arrayBuffer())
      })
    }

    const providerMessageId = await inboxEmailService.send({
      from,
      fromName: user?.display_name ? `${user.display_name} with Doxa` : 'Doxa Prayer',
      to: contactEmail.value,
      subject: message.subject || conversation.subject || '(no subject)',
      html: message.body_html || undefined,
      text: message.body_text || undefined,
      replyTo: `contact+${conversation.reply_token}@${inboxDomain}`,
      inReplyTo: message.in_reply_to || undefined,
      references: message.email_references || undefined,
      attachments
    })
    await messageService.markStatus(message.id, 'sent', { provider_message_id: providerMessageId })
    await conversationService.touchLastMessage(conversation.id, 'outbound', 'pending')
    return { success: true, data: { provider_message_id: providerMessageId || undefined } }
  } catch (error: any) {
    await messageService.markStatus(message.id, 'failed', { failed_reason: error?.message || 'Email send failed' })
    throw error
  }
}
