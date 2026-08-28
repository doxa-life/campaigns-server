import { peopleGroupReportService } from '../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')
  const report = await peopleGroupReportService.getById(id)

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }
  // Public suggestions stay editable until applied/denied (approvals persist
  // through edits); admin reports are editable only while pending.
  const editable = report.source === 'public'
    ? ['awaiting_verification', 'pending', 'approved'].includes(report.status)
    : report.status === 'pending'
  if (!editable) {
    throw createError({ statusCode: 400, statusMessage: 'This report can no longer be edited' })
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
