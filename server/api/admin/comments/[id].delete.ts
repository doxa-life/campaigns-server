import { commentService } from '#server/database/comments'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

const RECORD_TYPE_PERMISSIONS: Record<string, string> = {
  people_group: 'people_groups.view',
  group: 'groups.view',
  subscriber: 'subscribers.view'
}

export default defineEventHandler(async (event) => {
  const id = getIntParam(event, 'id')

  const existing = await commentService.getById(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  }

  const permission = RECORD_TYPE_PERMISSIONS[existing.record_type]
  if (!permission) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid record type' })
  }

  const user = await requirePermission(event, permission)

  if (existing.user_id !== user.userId) {
    throw createError({ statusCode: 403, statusMessage: 'You can only delete your own comments' })
  }

  try {
    await commentService.delete(id)
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete comment')
  }
})
