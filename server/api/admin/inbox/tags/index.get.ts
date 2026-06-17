import { inboxTagService } from '#server/database/inbox-tags'
import { handleApiError } from '#server/utils/api-helpers'

// The tag palette (master list of name + colour) shared across the inbox.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  try {
    const tags = await inboxTagService.list()
    return { tags }
  } catch (error) {
    handleApiError(error, 'Failed to list tags')
  }
})
