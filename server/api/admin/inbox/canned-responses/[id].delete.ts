import { cannedResponseService } from '#server/database/canned-responses'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')

  try {
    const deleted = await cannedResponseService.delete(id)
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'Canned response not found' })
    }
    logDelete('canned_responses', String(id), event, { message: 'Canned response deleted' })
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete canned response')
  }
})
