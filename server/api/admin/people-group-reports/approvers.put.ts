import { setReportApprovers } from '#server/utils/app/report-approvers'
import { userService } from '#server/database/users'

/**
 * PUT /api/admin/people-group-reports/approvers
 * Set the two designated users who review public /updates suggestions.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const body = await readBody<{ approvers: string[] }>(event)
  const ids = Array.isArray(body.approvers) ? [...new Set(body.approvers)] : []

  if (ids.length !== 2) {
    throw createError({ statusCode: 400, statusMessage: 'Exactly two distinct approvers are required' })
  }
  for (const id of ids) {
    const user = await userService.getUserById(id)
    if (!user) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown user selected as approver' })
    }
  }

  await setReportApprovers(ids)
  return { approvers: ids }
})
