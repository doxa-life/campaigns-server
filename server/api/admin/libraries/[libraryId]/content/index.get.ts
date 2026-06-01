import { libraryContentService } from '#server/database/library-content'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.view')

  const libraryId = getIntParam(event, 'libraryId')

  const query = getQuery(event)
  const grouped = query.grouped === 'true'
  const startDay = query.startDay ? parseInt(query.startDay as string) : undefined
  const endDay = query.endDay ? parseInt(query.endDay as string) : undefined
  const language = query.language as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const offset = query.offset ? parseInt(query.offset as string) : undefined

  if (grouped) {
    // Return content grouped by day
    const groupedContent = await libraryContentService.getLibraryContentGroupedByDay(libraryId, {
      startDay,
      endDay,
      limit,
      offset
    })

    // For each day, get all content items
    const contentWithDetails = await Promise.all(
      groupedContent.map(async (group) => {
        const content = await libraryContentService.getLibraryContent(libraryId, {
          startDay: group.dayNumber,
          endDay: group.dayNumber
        })
        return {
          dayNumber: group.dayNumber,
          languages: group.languages,
          content
        }
      })
    )

    return {
      content: contentWithDetails
    }
  } else {
    // Return flat list of content
    const content = await libraryContentService.getLibraryContent(libraryId, {
      startDay,
      endDay,
      language,
      limit,
      offset
    })

    return {
      content
    }
  }
})
