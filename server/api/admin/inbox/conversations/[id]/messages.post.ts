import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { jobQueueService, type OutboundEmailPayload } from '#server/database/job-queue'
import { userService } from '#server/database/users'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Compose / reply on a conversation (requires inbox.send).
 *
 * Body: { body_html, body_text?, from_identity?, saveDraft?, draft_id? }
 *  - from_identity: 'personal' (the sender's alias) | 'contact' (the general address).
 *    Defaults to 'personal' when the sender has an alias, otherwise 'contact'.
 *  - saveDraft + no draft_id  → create a shared draft
 *  - saveDraft + draft_id     → update an existing draft
 *  - !saveDraft + draft_id    → send that draft (mark queued + enqueue)
 *  - !saveDraft + no draft_id → create a queued message + enqueue
 *
 * Sending auto-assigns the conversation to the sender (if unassigned) and sets Pending.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const conversation = await conversationService.getById(id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const body = await readBody<{
    body_html?: string
    body_text?: string
    subject?: string
    from_identity?: 'personal' | 'contact'
    saveDraft?: boolean
    draft_id?: number
  }>(event)

  const bodyHtml = (body.body_html || '').trim()
  const bodyText = body.body_text ?? null

  if (!body.saveDraft && !bodyHtml && !body.draft_id) {
    throw createError({ statusCode: 400, statusMessage: 'Message body is required' })
  }

  // Resolve the chosen From address: the sender's alias (personal) or the general contact address.
  const config = useRuntimeConfig()
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const sender = await userService.getUserById(auth.userId)
  const useContact = body.from_identity === 'contact' || !sender?.email_alias
  const fromEmail = useContact ? contactAddress : `${sender!.email_alias}@${inboxDomain}`

  try {
    // A provided draft must belong to this conversation (mirrors the attachments endpoint),
    // so a reply can't be queued/assigned against one conversation while the message and
    // its eventual send target belong to another.
    if (body.draft_id) {
      const existingDraft = await messageService.getById(body.draft_id)
      if (!existingDraft || existingDraft.status !== 'draft' || existingDraft.conversation_id !== id) {
        throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
      }
    }

    // --- Draft handling ---
    if (body.saveDraft) {
      if (body.draft_id) {
        const updated = await messageService.updateDraft(body.draft_id, { body_html: bodyHtml, body_text: bodyText, from_email: fromEmail })
        if (!updated) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
        return { message: updated, draft: true }
      }
      const draft = await messageService.create({
        conversation_id: id,
        direction: 'outbound',
        status: 'draft',
        sender_user_id: auth.userId,
        from_email: fromEmail,
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
      // Apply latest edits + From choice, then queue. Personal signature only when
      // sending as the agent's own alias (not from the general contact address).
      const html = withSignature(bodyHtml || draft.body_html || '', useContact ? null : sender)
      await messageService.updateDraft(draft.id, { body_html: html, body_text: bodyText ?? draft.body_text, from_email: fromEmail })
      await messageService.markStatus(draft.id, 'queued')
      messageId = draft.id
    } else {
      const html = withSignature(bodyHtml, useContact ? null : sender)
      const created = await messageService.create({
        conversation_id: id,
        direction: 'outbound',
        status: 'queued',
        sender_user_id: auth.userId,
        from_email: fromEmail,
        subject: body.subject || conversation.subject,
        body_html: html,
        body_text: bodyText,
      })
      messageId = created.id
    }

    // Auto-assign to sender if unassigned + set Pending. Replying resolves any pending review.
    await conversationService.assignIfUnassigned(id, auth.userId)
    await conversationService.updateStatus(id, 'pending')
    await conversationService.setNeedsReview(id, false)
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

function withSignature(html: string, sender: { email_signature?: string | null } | null): string {
  if (sender?.email_signature) {
    return `${html}<br><br>${sender.email_signature}`
  }
  return html
}
