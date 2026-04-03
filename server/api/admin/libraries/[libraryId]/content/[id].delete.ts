import { libraryContentService } from '#server/database/library-content'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.delete')

  const id = getIntParam(event, 'id')

  try {
    const success = await libraryContentService.deleteLibraryContent(id)

    if (!success) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Content not found'
      })
    }

    return {
      success: true
    }
  } catch (error) {
    handleApiError(error, 'Failed to delete content', 400)
  }
})
