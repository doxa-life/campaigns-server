import { conversationService, type ConversationStatus } from '#server/database/conversations'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.view')
  const id = getIntParam(event, 'id')
  const body = await readBody<{ status?: ConversationStatus; assigned_user_id?: string | null; needs_review?: boolean }>(event)

  try {
    const existing = await conversationService.getById(id)
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

    if (body.status) await conversationService.updateStatus(id, body.status)
    if (body.assigned_user_id !== undefined) await conversationService.assign(id, body.assigned_user_id)
    if (body.needs_review !== undefined) await conversationService.setNeedsReview(id, body.needs_review)

    logUpdate('conversations', String(id), event, {
      changes: { updated_by: { from: null, to: user.userId } }
    })

    return { conversation: await conversationService.getById(id) }
  } catch (error) {
    handleApiError(error, 'Failed to update conversation')
  }
})
