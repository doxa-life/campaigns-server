import { getReportApprovers, getReportNotifyEmails } from '#server/utils/app/report-approvers'
import { userService } from '#server/database/users'

/**
 * GET /api/admin/people-group-reports/approvers
 * The two designated users who review public /updates suggestions, plus the
 * extra addresses notified when a suggestion is applied.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const ids = await getReportApprovers()
  const approvers = []
  for (const id of ids) {
    const user = await userService.getUserById(id)
    if (user) {
      approvers.push({ id: user.id, display_name: user.display_name, email: user.email })
    }
  }
  const notifyEmails = await getReportNotifyEmails()
  return { approvers, notify_emails: notifyEmails }
})
