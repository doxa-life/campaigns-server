import { libraryContentService } from '#server/database/library-content'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.view')

  const libraryId = getIntParam(event, 'libraryId')
  const dayNumber = getIntParam(event, 'dayNumber')

  // Get all content for this day in all languages
  const content = await libraryContentService.getLibraryContent(libraryId, {
    startDay: dayNumber,
    endDay: dayNumber
  })

  return {
    dayNumber,
    content
  }
})
