import type { Job, InboxEmailPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { conversationService } from '../../database/conversations'
import { messageService } from '../../database/conversation-messages'
import { sendInboxAutoAck } from '../../utils/inbox-auto-ack-email'
import { notifyNewConversation, notifyAssignee, notifyHeldSender } from '../../utils/inbox-notification-email'

/**
 * Durable inbox side-emails: auto-acknowledgements and staff notifications.
 *
 * These used to be fire-and-forget at the call site, so a transient send failure
 * (cold start, SMTP/provider hiccup) vanished silently. Routing them through the queue
 * gives retries and an auditable failure (the job row), instead of a lost email.
 *
 * On a recoverable failure we throw so the queue retries; when the underlying record
 * is gone we succeed (nothing to do) rather than retrying forever.
 */
export async function processInboxEmail(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as InboxEmailPayload

  switch (payload.kind) {
    case 'auto_ack': {
      if (!payload.to || !payload.conversation_id) return { success: true, data: { skipped: 'missing fields' } }
      const conversation = await conversationService.getById(payload.conversation_id)
      if (!conversation) return { success: true, data: { skipped: 'conversation gone' } }
      const ok = await sendInboxAutoAck({
        to: payload.to,
        name: payload.name ?? null,
        language: payload.language ?? 'en',
        replyToken: conversation.reply_token,
      })
      if (!ok) throw new Error('Auto-ack send failed')
      return { success: true }
    }

    case 'new_conversation': {
      if (!payload.conversation_id || !payload.message_id) return { success: true, data: { skipped: 'missing fields' } }
      const conversation = await conversationService.getById(payload.conversation_id)
      const message = await messageService.getById(payload.message_id)
      if (!conversation || !message) return { success: true, data: { skipped: 'record gone' } }
      const ok = await notifyNewConversation(conversation, message, { held: !!payload.held })
      if (!ok) throw new Error('New-conversation notification failed')
      return { success: true }
    }

    case 'assignee': {
      if (!payload.conversation_id || !payload.message_id) return { success: true, data: { skipped: 'missing fields' } }
      const conversation = await conversationService.getById(payload.conversation_id)
      const message = await messageService.getById(payload.message_id)
      if (!conversation || !message) return { success: true, data: { skipped: 'record gone' } }
      const ok = await notifyAssignee(conversation, message)
      if (!ok) throw new Error('Assignee notification failed')
      return { success: true }
    }

    case 'held_sender': {
      if (!payload.to) return { success: true, data: { skipped: 'no recipient' } }
      const ok = await notifyHeldSender(payload.to)
      if (!ok) throw new Error('Held-sender notification failed')
      return { success: true }
    }

    default:
      return { success: false, data: { error: `Unknown inbox_email kind: ${(payload as any).kind}` } }
  }
}
