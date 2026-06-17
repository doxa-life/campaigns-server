import { conversationService } from '#server/database/conversations'
import { handleApiError } from '#server/utils/api-helpers'

// Per-tag conversation counts for the rail's clickable tag list.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  try {
    const counts = await conversationService.tagCounts()
    return { counts }
  } catch (error) {
    handleApiError(error, 'Failed to count tags')
  }
})
