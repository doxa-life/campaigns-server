import { libraryService, PEOPLE_GROUP_LIBRARY, DAILY_PEOPLE_GROUP_LIBRARY, DAY_IN_LIFE_LIBRARY } from '#server/database/libraries'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.view')

  const query = getQuery(event)
  const search = query.search as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const offset = query.offset ? parseInt(query.offset as string) : undefined
  const includeVirtual = query.includeVirtual === 'true'

  const allLibraries = await libraryService.getAllLibraries({ search, limit, offset })

  // Filter out people_group libraries from database - use virtual instead
  const libraries = allLibraries.filter(library => library.type !== 'people_group')

  // Get stats for each library
  const librariesWithStats = await Promise.all(
    libraries.map(async (library) => {
      const stats = await libraryService.getLibraryStats(library.id)
      return {
        ...library,
        stats
      }
    })
  )

  // Optionally include virtual People Group libraries (for prayer-fuel-order page)
  if (includeVirtual) {
    const virtualStats = await libraryService.getLibraryStats(PEOPLE_GROUP_LIBRARY.id)
    librariesWithStats.push({
      ...PEOPLE_GROUP_LIBRARY,
      stats: virtualStats
    })

    const dailyVirtualStats = await libraryService.getLibraryStats(DAILY_PEOPLE_GROUP_LIBRARY.id)
    librariesWithStats.push({
      ...DAILY_PEOPLE_GROUP_LIBRARY,
      stats: dailyVirtualStats
    })

    const dayInLifeStats = await libraryService.getLibraryStats(DAY_IN_LIFE_LIBRARY.id)
    librariesWithStats.push({
      ...DAY_IN_LIFE_LIBRARY,
      stats: dayInLifeStats
    })
  }

  return {
    libraries: librariesWithStats,
    count: librariesWithStats.length
  }
})
