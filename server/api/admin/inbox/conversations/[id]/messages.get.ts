import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const id = getIntParam(event, 'id')
  const conversation = await conversationService.getById(id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  try {
    const [messages, drafts] = await Promise.all([
      messageService.listForConversation(id),
      messageService.listDrafts(id),
    ])
    return { messages, drafts }
  } catch (error) {
    handleApiError(error, 'Failed to load messages')
  }
})
