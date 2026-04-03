import { jobQueueService } from '#server/database/job-queue'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Cancel pending jobs for a bulk day_in_life translation batch.
 *
 * POST /api/admin/superadmin/translate-dinl/cancel?batchId=...
 */
export default defineEventHandler(async (event) => {
  try {
    await requireSuperAdmin(event)

    const query = getQuery(event)
    const batchId = Number(query.batchId)

    if (!batchId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'batchId is required'
      })
    }

    const cancelledCount = await jobQueueService.cancelPendingJobs('bulk_dinl', batchId)
    const stats = await jobQueueService.getJobStats('bulk_dinl', batchId)

    return {
      success: true,
      message: `Cancelled ${cancelledCount} pending job(s)`,
      cancelledCount,
      stats
    }
  } catch (error) {
    handleApiError(error, 'Failed to cancel translation')
  }
})
