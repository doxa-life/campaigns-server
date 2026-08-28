import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { isReportApprover } from '#server/utils/app/report-approvers'

/**
 * Record one designated approver's approval on a public suggestion. When both
 * designated approvers are on record the status flips to 'approved' — applying
 * still takes an explicit accept.
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  if (report.source !== 'public') {
    throw createError({ statusCode: 400, statusMessage: 'Only public suggestions use the approval flow' })
  }
  if (report.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Only pending suggestions can be approved' })
  }
  if (!(await isReportApprover(user.userId))) {
    throw createError({ statusCode: 403, statusMessage: 'Only a designated approver can approve suggestions' })
  }

  await peopleGroupReportService.addApproval(id, user.userId)

  logUpdate('people_group_reports', String(id), event, {
    changes: { approvals: { from: null, to: user.userId } }
  })

  return { report: await peopleGroupReportService.getById(id) }
})
