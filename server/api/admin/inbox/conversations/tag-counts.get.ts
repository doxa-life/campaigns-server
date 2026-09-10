import { conversationService } from '#server/database/conversations'
import { handleApiError } from '#server/utils/api-helpers'
import { requireInboxAccess } from '#server/utils/inbox-access'

// Per-tag conversation counts for the rail's clickable tag list.
export default defineEventHandler(async (event) => {
  const access = await requireInboxAccess(event, 'inbox.view')

  try {
    const counts = await conversationService.tagCounts(access.assignedOnly ? access.userId : undefined)
    return { counts }
  } catch (error) {
    handleApiError(error, 'Failed to count tags')
  }
})
