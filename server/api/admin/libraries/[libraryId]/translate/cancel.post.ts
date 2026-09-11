import { jobQueueService } from '#server/database/job-queue'
import { libraryService } from '#server/database/libraries'
import { requireContentAccess } from '#server/utils/content-access'

/**
 * Cancel pending translation jobs for a library
 *
 * POST /api/admin/libraries/[libraryId]/translate/cancel
 *
 * Cancels all pending translation jobs (processing jobs will complete)
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'content.create')

  const libraryId = parseInt(event.context.params?.libraryId || '0')

  if (!libraryId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid library ID'
    })
  }

  const library = await libraryService.getLibraryById(libraryId)
  await requireContentAccess(user.userId, 'content.create', { peopleGroupId: library?.people_group_id })

  const cancelledCount = await jobQueueService.cancelPendingJobs('library_translation', libraryId)
  const stats = await jobQueueService.getJobStats('library_translation', libraryId)

  return {
    success: true,
    message: `Cancelled ${cancelledCount} pending job(s)`,
    cancelledCount,
    stats
  }
})
