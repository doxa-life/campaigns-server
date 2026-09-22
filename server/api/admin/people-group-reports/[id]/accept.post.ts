import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { applyApprovedReport } from '#server/utils/app/apply-report'

/**
 * Accept a report and apply its changes. Admin-sourced reports apply on a
 * single reviewer's accept. A public suggestion normally applies as part of the
 * second approval; this endpoint is how one that stayed at 'approved' — because
 * that apply failed — is applied by hand.
 *
 * An "add" report is created from the completion fields stored on it, not from
 * the request body: reviewers edit and save them on the report itself.
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
  } else if (report.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Only pending reports can be accepted' })
  }

  return await applyApprovedReport(report, user.userId, event)
})
