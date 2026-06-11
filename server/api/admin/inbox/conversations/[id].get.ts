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

    // Attach signed download URLs for attachments (skipped in tests where S3 is unconfigured).
    // Sign in parallel rather than awaiting each in series.
    const withUrls = await Promise.all(attachments.map(async (att) => {
      let url: string | null = null
      if (!process.env.VITEST) {
        // Force a download with a neutral type: the stored ContentType is the sender's
        // untrusted value, so without this S3 would serve an evil.svg/evil.html inline
        // and it would execute in the staff browser. Sanitize the filename for the header.
        const safeName = (att.filename || 'attachment').replace(/[\r\n"\\]/g, '_').slice(0, 200)
        try {
          url = await generateSignedUrl(att.s3_key, undefined, {
            responseContentDisposition: `attachment; filename="${safeName}"`,
            responseContentType: 'application/octet-stream',
          })
        } catch { url = null }
      }
      return { ...att, url }
    }))
    const attachmentsByMessage: Record<number, any[]> = {}
    for (const att of withUrls) {
      ;(attachmentsByMessage[att.message_id] ||= []).push(att)
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
