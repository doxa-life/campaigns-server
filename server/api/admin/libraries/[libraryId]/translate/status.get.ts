import { jobQueueService } from '#server/database/job-queue'

/**
 * Get translation job status for a library
 *
 * GET /api/admin/libraries/[libraryId]/translate/status
 *
 * Returns job statistics for library translation jobs
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.create')

  const libraryId = parseInt(event.context.params?.libraryId || '0')

  if (!libraryId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid library ID'
    })
  }

  const stats = await jobQueueService.getJobStats('library_translation', libraryId)
  const isComplete = await jobQueueService.isComplete('library_translation', libraryId)

  // Collect verse warnings from completed jobs
  let verseWarnings: Array<{ reference: string; language: string; reason: string }> = []
  if (isComplete) {
    const jobs = await jobQueueService.getJobsByReference('library_translation', libraryId)
    for (const job of jobs) {
      if (job.result?.verse_warnings) {
        verseWarnings.push(...job.result.verse_warnings)
      }
    }
  }

  const errors = await jobQueueService.getFailureReasons('library_translation', libraryId)

  return {
    libraryId,
    ...stats,
    isComplete,
    verseWarnings,
    errors
  }
})
