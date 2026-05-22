import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { attachmentService } from '#server/database/conversation-attachments'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'
import { signedAttachmentUrl } from '#server/utils/inbox-attachments'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')
  const id = getIntParam(event, 'id')

  try {
    const conversation = await conversationService.getById(id)
    if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    const messages = await messageService.listForConversation(id)
    const attachmentRows = await attachmentService.listForConversation(id)
    const attachments = await Promise.all(attachmentRows.map(async a => ({
      ...a,
      url: await signedAttachmentUrl(a.s3_key)
    })))
    return { conversation, messages, attachments }
  } catch (error) {
    handleApiError(error, 'Failed to fetch conversation')
  }
})
