import { inboxTagService } from '#server/database/inbox-tags'
import { handleApiError } from '#server/utils/api-helpers'

// Delete a tag from the palette and strip it off every conversation that carries it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Tag slug is required' })
  }

  try {
    await inboxTagService.delete(slug)
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete tag')
  }
})
