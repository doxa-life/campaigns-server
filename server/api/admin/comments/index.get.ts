import { commentService } from '#server/database/comments'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const recordType = query.record_type as string
  const recordId = Number(query.record_id)

  if (!recordType || !recordId || isNaN(recordId)) {
    throw createError({ statusCode: 400, statusMessage: 'record_type and record_id are required' })
  }

  try {
    const comments = await commentService.getForRecord(recordType, recordId)
    return { comments }
  } catch (error) {
    handleApiError(error, 'Failed to fetch comments')
  }
})
