import { commentService } from '#server/database/comments'
import { sanitizeTiptapContent } from '#server/utils/sanitize-tiptap'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

const RECORD_TYPE_PERMISSIONS: Record<string, string> = {
  people_group: 'people_groups.view',
  group: 'groups.view',
  subscriber: 'subscribers.view',
  people_group_report: 'people_groups.view'
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
    throw createError({ statusCode: 403, statusMessage: 'You can only edit your own comments' })
  }

  const body = await readBody<{ content: Record<string, any> }>(event)
  if (!body.content) {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  const sanitized = sanitizeTiptapContent(body.content)
  if (!sanitized) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid content' })
  }

  try {
    const comment = await commentService.update(id, sanitized)
    return { comment }
  } catch (error) {
    handleApiError(error, 'Failed to update comment')
  }
})
