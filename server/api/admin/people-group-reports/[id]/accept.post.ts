import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { applyReport } from '#server/utils/app/apply-report'
import { parseAddReportFields, type AddReportFields } from '#server/utils/app/add-report-fields'
import { sendReportOutcomeEmail, notifyReportApplied } from '#server/utils/app/report-emails'

/**
 * Accept a report and apply its changes. Admin-sourced reports apply on a
 * single reviewer's accept; public-sourced reports must already hold both
 * designated approvals (status 'approved'), after which any user with edit
 * rights can trigger the apply.
 *
 * An "add" report also needs the editor's completion fields in the body
 * (`fields`, validated by parseAddReportFields) and may carry the IMB detail
 * `metadata` proposed by auto-populate.
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

  const body = (await readBody<{ fields?: AddReportFields; metadata?: Record<string, any> }>(event)) || {}
  const addFields = report.type === 'add' ? parseAddReportFields(body.fields) : undefined

  const result = await applyReport(id, user.userId, event, { addFields, addMetadata: body.metadata })

  if (report.source === 'public' && result.report) {
    sendReportOutcomeEmail(result.report, 'applied').catch((err) =>
      console.error('Failed to send report outcome email:', err)
    )
    notifyReportApplied(result.report, result.peopleGroup).catch((err) =>
      console.error('Failed to send applied-suggestion notifications:', err)
    )
  }

  return result
})
