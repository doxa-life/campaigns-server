import { prayerContentService } from '#server/database/prayer-content'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.view')

  const libraryId = getIntParam(event, 'libraryId')

  // Match the scheduler's notion of "today" (UTC date) so the highlighted day
  // is exactly what subscribers receive.
  const today = new Date().toISOString().split('T')[0]!

  const schedule = await prayerContentService.getLibrarySchedule(libraryId, today)

  return { schedule }
})
