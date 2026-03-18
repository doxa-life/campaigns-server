import { libraryService } from '#server/database/libraries'
import { prayerContentService } from '#server/database/prayer-content'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require admin authentication
  await requireAdmin(event)

  const id = getIntParam(event, 'libraryId')

  const oldLibrary = await libraryService.getLibraryById(id)
  if (!oldLibrary) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  const body = await readBody(event)

  try {
    const library = await libraryService.updateLibrary(id, {
      name: body.name,
      description: body.description,
      repeating: body.repeating
    })

    if (!library) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Library not found'
      })
    }

    // Clear cached library stats so changes take effect immediately
    prayerContentService.clearLibraryCache(id)

    const changes: Record<string, { from: any; to: any }> = {}
    if (body.name !== undefined && body.name !== oldLibrary.name) {
      changes.name = { from: oldLibrary.name, to: body.name }
    }
    if (body.description !== undefined && body.description !== oldLibrary.description) {
      changes.description = { from: oldLibrary.description, to: body.description }
    }
    if (body.repeating !== undefined && body.repeating !== oldLibrary.repeating) {
      changes.repeating = { from: oldLibrary.repeating, to: body.repeating }
    }
    if (Object.keys(changes).length > 0) {
      logUpdate('libraries', String(id), event, { changes })
    }

    return {
      success: true,
      library
    }
  } catch (error) {
    handleApiError(error, 'Failed to update library', 400)
  }
})
