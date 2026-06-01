import { libraryService } from '#server/database/libraries'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.create')

  const body = await readBody(event)

  // Validate required fields
  if (!body.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Library name is required'
    })
  }

  try {
    const library = await libraryService.createLibrary({
      name: body.name,
      description: body.description,
      repeating: body.repeating
    })

    logCreate('libraries', String(library.id), event)

    return {
      success: true,
      library
    }
  } catch (error) {
    handleApiError(error, 'Failed to create library', 400)
  }
})
