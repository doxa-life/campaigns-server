import { libraryContentService } from '#server/database/library-content'
import { libraryService } from '#server/database/libraries'
import { requireContentAccess } from '#server/utils/content-access'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'content.delete')

  const id = getIntParam(event, 'id')

  const existing = await libraryContentService.getLibraryContentById(id)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Content not found'
    })
  }

  const library = await libraryService.getLibraryById(existing.library_id)
  await requireContentAccess(user.userId, 'content.delete', {
    peopleGroupId: library?.people_group_id,
    languageCodes: [existing.language_code]
  })

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
