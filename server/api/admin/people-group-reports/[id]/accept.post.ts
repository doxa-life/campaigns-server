import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { applyReport } from '#server/utils/app/apply-report'
import { isReportApprover } from '#server/utils/app/report-approvers'
import { sendReportOutcomeEmail } from '#server/utils/app/report-emails'

/**
 * Accept a report and apply its changes. Admin-sourced reports apply on a
 * single reviewer's accept; public-sourced reports must already hold both
 * designated approvals (status 'approved') and only a designated approver can
 * trigger the apply.
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  if (report.source === 'public') {
    if (report.status !== 'approved') {
      throw createError({ statusCode: 400, statusMessage: 'Public suggestions need both approvals before they can be applied' })
    }
    if (!(await isReportApprover(user.userId))) {
      throw createError({ statusCode: 403, statusMessage: 'Only a designated approver can apply this suggestion' })
    }
  } else if (report.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Only pending reports can be accepted' })
  }

  const result = await applyReport(id, user.userId, event)

  if (report.source === 'public' && result.report) {
    sendReportOutcomeEmail(result.report, 'applied').catch((err) =>
      console.error('Failed to send report outcome email:', err)
    )
  }

  return result
})
