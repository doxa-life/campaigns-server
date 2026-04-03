import { adoptionReportService } from '../../../database/adoption-reports'
import { getIntParam } from '#server/utils/api-helpers'

const VALID_STATUSES = ['submitted', 'approved', 'rejected'] as const

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'groups.edit')

  const id = getIntParam(event, 'id')
  const body = await readBody<{
    status: 'submitted' | 'approved' | 'rejected'
  }>(event)

  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: `status is required and must be one of: ${VALID_STATUSES.join(', ')}` })
  }

  const updated = await adoptionReportService.updateStatus(id, body.status)

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })
  }

  return { report: updated }
})
