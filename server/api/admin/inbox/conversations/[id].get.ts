import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { conversationAttachmentService } from '#server/database/conversation-attachments'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const id = getIntParam(event, 'id')

  try {
    const conversation = await conversationService.getByIdWithDetails(id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }

    const [messages, drafts, attachments] = await Promise.all([
      messageService.listForConversation(id),
      messageService.listDrafts(id),
      conversationAttachmentService.listForConversation(id),
    ])

    // Attach signed download URLs for attachments (skipped in tests where S3 is unconfigured)
    const attachmentsByMessage: Record<number, any[]> = {}
    for (const att of attachments) {
      let url: string | null = null
      if (!process.env.VITEST) {
        try { url = await generateSignedUrl(att.s3_key) } catch { url = null }
      }
      ;(attachmentsByMessage[att.message_id] ||= []).push({ ...att, url })
    }

    const messagesWithAttachments = messages.map(m => ({
      ...m,
      attachments: attachmentsByMessage[m.id] || [],
    }))

    return { conversation, messages: messagesWithAttachments, drafts }
  } catch (error) {
    handleApiError(error, 'Failed to load conversation')
  }
})
