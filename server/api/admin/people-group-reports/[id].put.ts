import { peopleGroupReportService } from '../../../database/people-group-reports'
import { getIntParam } from '#server/utils/api-helpers'
import { parseAddFieldsDraft } from '#server/utils/app/add-report-fields'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.edit')

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
    add_fields?: { values?: Record<string, any> }
  }>(event)

  const touchesReport = ['suggested_changes', 'notes', 'reporter_name', 'reporter_email'].some(
    (key) => body[key as keyof typeof body] !== undefined
  )
  let updated = touchesReport ? await peopleGroupReportService.update(id, body) : report

  // A reviewer's corrections to the fields proposed for an "add". Each value is
  // validated as strictly as on apply, but a required one may still be empty —
  // the approval gate is where that is caught.
  if (body.add_fields) {
    if (report.type !== 'add') {
      throw createError({ statusCode: 400, statusMessage: 'Only add reports carry completion fields' })
    }
    const values = parseAddFieldsDraft(body.add_fields.values)
    updated = await peopleGroupReportService.saveAddFieldsEdit(id, values, user.userId)
  }

  logUpdate('people_group_reports', String(id), event)

  return { report: updated }
})
