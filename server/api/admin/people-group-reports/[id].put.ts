import { peopleGroupReportService } from '../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  if (report.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Only pending reports can be edited' })
  }

  const body = await readBody<{
    suggested_changes?: Record<string, any>
    notes?: string | null
    reporter_name?: string
    reporter_email?: string | null
  }>(event)

  const updated = await peopleGroupReportService.update(id, body)

  logUpdate('people_group_reports', String(id), event)

  return { report: updated }
})
