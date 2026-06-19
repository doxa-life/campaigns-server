import { peopleGroupReportService } from '../../../../database/people-group-reports'
import { peopleGroupService } from '../../../../database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  if (report.people_group_id) {
    throw createError({ statusCode: 400, statusMessage: 'Report is already linked to a people group' })
  }

  const body = await readBody<{ people_group_id?: number }>(event)
  if (!body.people_group_id) {
    throw createError({ statusCode: 400, statusMessage: 'people_group_id is required' })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupById(body.people_group_id)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  await peopleGroupReportService.link(id, body.people_group_id)

  logUpdate('people_group_reports', String(id), event, {
    changes: { people_group_id: { from: null, to: body.people_group_id } }
  })

  return { report: await peopleGroupReportService.getById(id) }
})
