import { marketingEmailService } from '#server/database/marketing-emails'
import { jobQueueService } from '#server/database/job-queue'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.send')

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email ID'
    })
  }

  const canAccess = await marketingEmailService.canUserAccessEmail(user.userId, id)
  if (!canAccess) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  const email = await marketingEmailService.getById(id)
  if (!email) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  if (email.status !== 'queued' && email.status !== 'sending') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only sending emails can be stopped'
    })
  }

  try {
    // Delete every recipient job that hasn't started yet, then mark the email
    // cancelled. Jobs already processing finish; the processor's per-job status
    // check skips any remaining sends for a cancelled email.
    const cancelledCount = await jobQueueService.cancelPendingJobs('marketing_email', id)
    await marketingEmailService.updateStatus(id, 'cancelled')

    const stats = await jobQueueService.getJobStats('marketing_email', id)

    return {
      success: true,
      message: `Stopped sending — ${cancelledCount} pending recipient(s) cancelled`,
      cancelledCount,
      stats
    }
  } catch (error) {
    handleApiError(error, 'Failed to stop email')
  }
})
