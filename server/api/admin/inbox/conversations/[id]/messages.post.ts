import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { jobQueueService, type OutboundEmailPayload } from '#server/database/job-queue'
import { userService } from '#server/database/users'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Compose / reply on a conversation (requires inbox.send).
 *
 * Body: { body_html, body_text?, saveDraft?, draft_id? }
 *  - saveDraft + no draft_id  → create a shared draft
 *  - saveDraft + draft_id     → update an existing draft
 *  - !saveDraft + draft_id    → send that draft (mark queued + enqueue)
 *  - !saveDraft + no draft_id → create a queued message + enqueue
 *
 * Sending auto-assigns the conversation to the sender (if unassigned) and sets Pending.
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const conversation = await conversationService.getById(id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const body = await readBody<{
    body_html?: string
    body_text?: string
    subject?: string
    saveDraft?: boolean
    draft_id?: number
  }>(event)

  const bodyHtml = (body.body_html || '').trim()
  const bodyText = body.body_text ?? null

  if (!body.saveDraft && !bodyHtml && !body.draft_id) {
    throw createError({ statusCode: 400, statusMessage: 'Message body is required' })
  }

  try {
    // --- Draft handling ---
    if (body.saveDraft) {
      if (body.draft_id) {
        const updated = await messageService.updateDraft(body.draft_id, { body_html: bodyHtml, body_text: bodyText })
        if (!updated) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
        return { message: updated, draft: true }
      }
      const draft = await messageService.create({
        conversation_id: id,
        direction: 'outbound',
        status: 'draft',
        sender_user_id: user.userId,
        subject: body.subject || conversation.subject,
        body_html: bodyHtml,
        body_text: bodyText,
      })
      return { message: draft, draft: true }
    }

    // --- Send path ---
    let messageId: number

    if (body.draft_id) {
      const draft = await messageService.getById(body.draft_id)
      if (!draft || draft.status !== 'draft') {
        throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
      }
      // Apply latest edits + append signature, then queue
      const html = await withSignature(bodyHtml || draft.body_html || '', user.userId)
      await messageService.updateDraft(draft.id, { body_html: html, body_text: bodyText ?? draft.body_text })
      await messageService.markStatus(draft.id, 'queued')
      messageId = draft.id
    } else {
      const html = await withSignature(bodyHtml, user.userId)
      const created = await messageService.create({
        conversation_id: id,
        direction: 'outbound',
        status: 'queued',
        sender_user_id: user.userId,
        subject: body.subject || conversation.subject,
        body_html: html,
        body_text: bodyText,
      })
      messageId = created.id
    }

    // Auto-assign to sender if unassigned + set Pending
    await conversationService.assignIfUnassigned(id, user.userId)
    await conversationService.updateStatus(id, 'pending')
    await conversationService.touchLastMessage(id, new Date().toISOString(), 'outbound')

    const payload: OutboundEmailPayload = { message_id: messageId }
    await jobQueueService.createJob('outbound_email', payload, {
      referenceType: 'conversation',
      referenceId: id,
    })

    logCreate('conversations', String(id), event, { message: 'Reply queued', direction: 'outbound' })

    const message = await messageService.getById(messageId)
    return { message, queued: true }
  } catch (error) {
    handleApiError(error, 'Failed to send message')
  }
})

async function withSignature(html: string, userId: string): Promise<string> {
  const user = await userService.getUserById(userId)
  if (user?.email_signature) {
    return `${html}<br><br>${user.email_signature}`
  }
  return html
}
