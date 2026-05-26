import { cannedResponseService } from '#server/database/canned-responses'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')
  try {
    const cannedResponses = await cannedResponseService.list()
    return { cannedResponses }
  } catch (error) {
    handleApiError(error, 'Failed to list canned responses')
  }
})
