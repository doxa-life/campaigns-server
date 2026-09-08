import { libraryContentService } from '#server/database/library-content'
import { libraryService } from '#server/database/libraries'
import { requireContentAccess } from '#server/utils/content-access'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'content.edit')

  const id = getIntParam(event, 'id')

  const body = await readBody(event)

  const existing = await libraryContentService.getLibraryContentById(id)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Content not found'
    })
  }

  // Moving a row to another language touches both the current and the new language.
  const library = await libraryService.getLibraryById(existing.library_id)
  const languageCodes = [existing.language_code]
  if (body.language_code && body.language_code !== existing.language_code) {
    languageCodes.push(body.language_code)
  }
  await requireContentAccess(user.userId, 'content.edit', {
    peopleGroupId: library?.people_group_id,
    languageCodes
  })

  try {
    const content = await libraryContentService.updateLibraryContent(id, {
      content_json: body.content_json,
      day_number: body.day_number,
      language_code: body.language_code
    })

    if (!content) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Content not found'
      })
    }

    return {
      success: true,
      content
    }
  } catch (error) {
    handleApiError(error, 'Failed to update content', 400)
  }
})
