import { peopleGroupReportService } from '../../../database/people-group-reports'
import { peopleGroupService } from '../../../database/people-groups'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const body = await readBody<{
    people_group_id: number
    reporter_name: string
    reporter_email?: string
    suggested_changes: Record<string, any>
    notes?: string
  }>(event)

  if (!body.people_group_id) {
    throw createError({ statusCode: 400, statusMessage: 'People group is required' })
  }
  if (!body.reporter_name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Reporter name is required' })
  }
  if (!body.suggested_changes || Object.keys(body.suggested_changes).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one field change is required' })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupById(body.people_group_id)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const report = await peopleGroupReportService.create({
    people_group_id: body.people_group_id,
    reporter_name: body.reporter_name.trim(),
    reporter_email: body.reporter_email?.trim() || null,
    suggested_changes: body.suggested_changes,
    notes: body.notes?.trim() || null
  })

  logCreate('people_group_reports', String(report.id), event)

  return { report }
})
