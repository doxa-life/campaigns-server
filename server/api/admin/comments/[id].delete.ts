import { commentService } from '#server/database/comments'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = getIntParam(event, 'id')

  try {
    const existing = await commentService.getById(id)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
    }

    if (existing.user_id !== user.userId) {
      throw createError({ statusCode: 403, statusMessage: 'You can only delete your own comments' })
    }

    await commentService.delete(id)
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete comment')
  }
})
