import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { isReportApprover } from '#server/utils/app/report-approvers'
import { applyApprovedReport } from '#server/utils/app/apply-report'
import { missingAddReportFields, readAddFields } from '#server/utils/app/add-report-fields'
import { peopleGroupFieldLabel } from '#server/utils/app/people-group-field-labels'

/**
 * Record one designated approver's approval on a public suggestion. The second
 * approval both flips the status to 'approved' and applies the suggestion —
 * an "add" cannot be approved until its completion fields are filled, so by
 * this point there is nothing left to confirm.
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
  // Applying an "add" creates the people group, so anything auto-populate could
  // not determine is a reviewer's to fill before the suggestion is approved.
  if (report.type === 'add') {
    const missing = missingAddReportFields(readAddFields(report.add_fields).values)
    if (missing.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Fill in the completion fields before approving: ${missing.map(peopleGroupFieldLabel).join(', ')}`
      })
    }
  }

  await peopleGroupReportService.addApproval(id, user.userId)

  logUpdate('people_group_reports', String(id), event, {
    changes: { approvals: { from: null, to: user.userId } }
  })

  const approved = await peopleGroupReportService.getById(id)
  if (approved?.status !== 'approved') {
    return { report: approved }
  }

  try {
    const result = await applyApprovedReport(approved, user.userId, event)
    return { report: result.report ?? approved, applied: true }
  } catch (error: any) {
    // The approval is already on record and stays there. The report rests at
    // 'approved' so it can be applied by hand once the cause is fixed.
    const apply_error = error?.statusMessage || error?.message || 'Failed to apply the suggestion'
    console.error('Applying a suggestion on its final approval failed:', apply_error)
    return { report: approved, applied: false, apply_error }
  }
})
