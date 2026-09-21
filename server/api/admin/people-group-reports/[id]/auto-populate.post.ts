import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { autoPopulateAddReport } from '#server/utils/app/add-report-autofill'

/**
 * Propose the completion fields for an "add" report and save them. The
 * proposal is normally made when the reporter verifies their email; this is how
 * a reviewer regenerates it, or fills in a report that predates it. Values a
 * reviewer has already corrected are kept.
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

  const result = await autoPopulateAddReport(report)
  const saved = await peopleGroupReportService.saveAddFieldsProposal(id, result)

  logUpdate('people_group_reports', String(id), event)

  return { report: saved, source: result.source, warning: result.warning }
})
