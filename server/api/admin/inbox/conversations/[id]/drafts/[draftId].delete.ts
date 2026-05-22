import { messageService } from '#server/database/conversation-messages'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const draftId = parseInt(getRouterParam(event, 'draftId') || '', 10)
  if (Number.isNaN(draftId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid draft id' })
  }

  try {
    const deleted = await messageService.deleteDraft(draftId)
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
    }
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete draft')
  }
})
