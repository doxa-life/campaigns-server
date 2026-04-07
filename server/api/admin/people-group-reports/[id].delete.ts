import { peopleGroupReportService } from '../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  await peopleGroupReportService.delete(id)

  logDelete('people_group_reports', String(id), event, {
    deletedRecord: { reporter_name: report.reporter_name, people_group_name: report.people_group_name }
  })

  return { success: true }
})
