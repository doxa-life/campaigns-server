import { libraryService } from '#server/database/libraries'
import { requireContentAccess } from '#server/utils/content-access'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'content.view')

  const id = getIntParam(event, 'libraryId')

  const library = await libraryService.getLibraryById(id)

  if (!library) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Library not found'
    })
  }

  await requireContentAccess(user.userId, 'content.view', { peopleGroupId: library.people_group_id })

  // Get stats
  const stats = await libraryService.getLibraryStats(id)

  return {
    library: {
      ...library,
      stats
    }
  }
})
