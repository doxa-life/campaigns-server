import { marketingEmailService } from '#server/database/marketing-emails'
import { jobQueueService } from '#server/database/job-queue'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.view')

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

  const email = await marketingEmailService.getByIdWithPeopleGroup(id)
  if (!email) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  let queueStats = null
  if (email.status !== 'draft') {
    const stats = await jobQueueService.getJobStats('marketing_email', id)
    queueStats = {
      total: stats.total,
      pending: stats.pending,
      processing: stats.processing,
      sent: stats.completed,
      failed: stats.failed
    }
  }

  return {
    email,
    queueStats
  }
})
