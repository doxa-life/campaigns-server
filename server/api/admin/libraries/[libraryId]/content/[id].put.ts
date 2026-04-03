import { libraryContentService } from '#server/database/library-content'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.edit')

  const id = getIntParam(event, 'id')

  const body = await readBody(event)

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
