import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  if (report.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Only pending reports can be denied' })
  }

  const body = await readBody<{ notes?: string }>(event) || {}

  await peopleGroupReportService.updateStatus(id, 'denied', user.userId)

  logUpdate('people_group_reports', String(id), event, {
    changes: { status: { from: 'pending', to: 'denied' } }
  })

  return { report: await peopleGroupReportService.getById(id) }
})
