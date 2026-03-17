import { commentService } from '#server/database/comments'
import { sanitizeTiptapContent } from '#server/utils/sanitize-tiptap'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = getIntParam(event, 'id')

  const body = await readBody<{ content: Record<string, any> }>(event)
  if (!body.content) {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  const sanitized = sanitizeTiptapContent(body.content)
  if (!sanitized) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid content' })
  }

  try {
    const existing = await commentService.getById(id)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
    }

    if (existing.user_id !== user.userId) {
      throw createError({ statusCode: 403, statusMessage: 'You can only edit your own comments' })
    }

    const comment = await commentService.update(id, sanitized)
    return { comment }
  } catch (error) {
    handleApiError(error, 'Failed to update comment')
  }
})
