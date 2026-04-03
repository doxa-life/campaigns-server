import { commentService } from '#server/database/comments'
import { handleApiError } from '#server/utils/api-helpers'

const RECORD_TYPE_PERMISSIONS: Record<string, string> = {
  people_group: 'people_groups.view',
  group: 'groups.view',
  subscriber: 'subscribers.view'
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const recordType = query.record_type as string
  const recordId = Number(query.record_id)

  if (!recordType || !recordId || isNaN(recordId)) {
    throw createError({ statusCode: 400, statusMessage: 'record_type and record_id are required' })
  }

  const permission = RECORD_TYPE_PERMISSIONS[recordType]
  if (!permission) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid record type' })
  }

  await requirePermission(event, permission)

  try {
    const comments = await commentService.getForRecord(recordType, recordId)
    return { comments }
  } catch (error) {
    handleApiError(error, 'Failed to fetch comments')
  }
})
