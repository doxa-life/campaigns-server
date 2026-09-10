import { syncGroundingDocuments } from '#server/utils/inbox/grounding-sync'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Manually refresh the cached doxa.life grounding content (requires the full inbox.send).
 */
export default defineEventHandler(async (event) => {
  await requireUnscopedPermission(event, 'inbox.send')
  try {
    const result = await syncGroundingDocuments()
    return result
  } catch (error) {
    handleApiError(error, 'Failed to refresh grounding content')
  }
})
