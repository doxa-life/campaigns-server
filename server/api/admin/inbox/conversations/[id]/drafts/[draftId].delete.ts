import { messageService } from '#server/database/conversation-messages'
import { handleApiError } from '#server/utils/api-helpers'
import { requireInboxAccess, requireAccessibleConversation } from '#server/utils/inbox-access'

export default defineEventHandler(async (event) => {
  const access = await requireInboxAccess(event, 'inbox.send')

  const conversationId = parseInt(getRouterParam(event, 'id') || '', 10)
  const draftId = parseInt(getRouterParam(event, 'draftId') || '', 10)
  if (Number.isNaN(conversationId) || Number.isNaN(draftId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  await requireAccessibleConversation(access, conversationId)

  try {
    // Scope the delete to the conversation in the path so a draft can't be deleted via a
    // different conversation's URL.
    const deleted = await messageService.deleteDraft(draftId, conversationId)
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
    }
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete draft')
  }
})
