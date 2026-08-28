import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { isReportApprover } from '#server/utils/app/report-approvers'
import { sendReportOutcomeEmail } from '#server/utils/app/report-emails'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  if (report.source === 'public') {
    // Either designated approver can deny unilaterally, at any pre-apply stage.
    if (!['awaiting_verification', 'pending', 'approved'].includes(report.status)) {
      throw createError({ statusCode: 400, statusMessage: 'This suggestion has already been resolved' })
    }
    if (!(await isReportApprover(user.userId))) {
      throw createError({ statusCode: 403, statusMessage: 'Only a designated approver can deny suggestions' })
    }
  } else if (report.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Only pending reports can be denied' })
  }

  const previousStatus = report.status
  await peopleGroupReportService.updateStatus(id, 'denied', user.userId)

  logUpdate('people_group_reports', String(id), event, {
    changes: { status: { from: previousStatus, to: 'denied' } }
  })

  const denied = await peopleGroupReportService.getById(id)
  if (report.source === 'public' && denied) {
    sendReportOutcomeEmail(denied, 'denied').catch((err) =>
      console.error('Failed to send report outcome email:', err)
    )
  }

  return { report: denied }
})
