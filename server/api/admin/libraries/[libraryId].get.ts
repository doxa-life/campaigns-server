import { libraryService } from '#server/database/libraries'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.view')

  const id = getIntParam(event, 'libraryId')

  const library = await libraryService.getLibraryById(id)

  if (!library) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Library not found'
    })
  }

  // Get stats
  const stats = await libraryService.getLibraryStats(id)

  return {
    library: {
      ...library,
      stats
    }
  }
})
