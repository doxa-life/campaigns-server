import { peopleGroupReportService } from '../../../database/people-group-reports'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const query = getQuery(event)
  const status = query.status as string | undefined
  const peopleGroupId = query.people_group_id ? parseInt(query.people_group_id as string) : undefined
  const search = query.search as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const offset = query.offset ? parseInt(query.offset as string) : undefined

  const [reports, total] = await Promise.all([
    peopleGroupReportService.getAll({ status, peopleGroupId, search, limit, offset }),
    peopleGroupReportService.count({ status, peopleGroupId, search })
  ])

  return { reports, total }
})
