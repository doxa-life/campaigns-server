import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { autoPopulateAddReport } from '#server/utils/app/add-report-autofill'

/**
 * Propose the completion fields for an "add" report so the editor can review
 * them before applying. Nothing is saved here.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  if (report.type !== 'add') {
    throw createError({ statusCode: 400, statusMessage: 'Only add reports can be auto-populated' })
  }
  if (report.status === 'accepted') {
    throw createError({ statusCode: 400, statusMessage: 'This report has already been applied' })
  }

  return await autoPopulateAddReport(report)
})
