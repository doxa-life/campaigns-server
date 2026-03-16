import { commentService } from '#server/database/comments'
import { sanitizeTiptapContent } from '#server/utils/sanitize-tiptap'
import { handleApiError } from '#server/utils/api-helpers'
import { requireFormApiKey } from '#server/utils/form-api-key'

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody<{
    record_type: string
    record_id: number
    author_label: string
    content: Record<string, any>
  }>(event)

  if (!body.record_type || !body.record_id || !body.author_label || !body.content) {
    throw createError({ statusCode: 400, statusMessage: 'record_type, record_id, author_label, and content are required' })
  }

  const sanitized = sanitizeTiptapContent(body.content)
  if (!sanitized) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid content' })
  }

  try {
    const comment = await commentService.create({
      record_type: body.record_type,
      record_id: body.record_id,
      user_id: null,
      author_label: body.author_label,
      content: sanitized
    })

    return { comment }
  } catch (error) {
    handleApiError(error, 'Failed to create comment')
  }
})
