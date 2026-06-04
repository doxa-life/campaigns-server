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
    // Mark cancelled BEFORE deleting pending jobs, so the processor's per-job live
    // status check skips any in-flight jobs that haven't sent yet during the brief
    // window before the delete lands. Then drop every not-yet-started recipient job.
    await marketingEmailService.updateStatus(id, 'cancelled')
    const cancelledCount = await jobQueueService.cancelPendingJobs('marketing_email', id)

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
