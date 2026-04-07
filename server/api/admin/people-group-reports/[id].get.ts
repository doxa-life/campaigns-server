import { peopleGroupReportService } from '../../../database/people-group-reports'
import { peopleGroupService } from '../../../database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupById(report.people_group_id)

  return {
    report,
    peopleGroup: peopleGroup ? {
      ...peopleGroup,
      metadata: peopleGroup.metadata || {},
      descriptions: peopleGroup.descriptions || {}
    } : null
  }
})
