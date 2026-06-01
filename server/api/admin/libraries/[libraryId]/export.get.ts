import { libraryService, type LibraryExportData, PEOPLE_GROUP_LIBRARY_ID, DAILY_PEOPLE_GROUP_LIBRARY_ID } from '#server/database/libraries'
import { libraryContentService } from '#server/database/library-content'
import { peopleGroupService } from '#server/database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require authentication (supports API key or JWT)
  const user = checkAuth(event)

  const id = getIntParam(event, 'libraryId')

  // Cannot export virtual libraries
  if (id === PEOPLE_GROUP_LIBRARY_ID || id === DAILY_PEOPLE_GROUP_LIBRARY_ID) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot export virtual libraries'
    })
  }

  const library = await libraryService.getLibraryById(id)

  if (!library) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Library not found'
    })
  }

  // If this is a people group library, check user has access
  if (library.people_group_id) {
    const hasAccess = await peopleGroupService.userCanAccessPeopleGroup(user.userId, library.people_group_id)
    if (!hasAccess) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have access to this people group'
      })
    }
  }

  // Get all content for export
  const content = await libraryContentService.getAllContentForExport(id)

  // Calculate stats
  const languageCoverage: Record<string, number> = {}
  const daySet = new Set<number>()

  for (const item of content) {
    daySet.add(item.day_number)
    languageCoverage[item.language_code] = (languageCoverage[item.language_code] || 0) + 1
  }

  const exportData: LibraryExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    library: {
      name: library.name,
      description: library.description,
      type: library.type,
      repeating: library.repeating,
      library_key: library.library_key
    },
    content,
    stats: {
      totalDays: daySet.size,
      totalContentItems: content.length,
      languageCoverage
    }
  }

  return exportData
})
