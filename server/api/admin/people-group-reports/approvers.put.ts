import { setReportApprovers, setReportNotifyEmails } from '#server/utils/app/report-approvers'
import { userService } from '#server/database/users'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NOTIFY_EMAILS = 20

/**
 * PUT /api/admin/people-group-reports/approvers
 * Set the two designated users who review public /updates suggestions and,
 * when `notify_emails` is sent, the extra addresses told of applied ones.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const body = await readBody<{ approvers: string[]; notify_emails?: string[] }>(event)
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

  let notifyEmails: string[] | undefined
  if (body.notify_emails !== undefined) {
    if (!Array.isArray(body.notify_emails)) {
      throw createError({ statusCode: 400, statusMessage: 'notify_emails must be a list of email addresses' })
    }
    notifyEmails = [...new Set(body.notify_emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    const invalid = notifyEmails.find((e) => !EMAIL_RE.test(e))
    if (invalid) {
      throw createError({ statusCode: 400, statusMessage: `Invalid notification email: ${invalid}` })
    }
    if (notifyEmails.length > MAX_NOTIFY_EMAILS) {
      throw createError({ statusCode: 400, statusMessage: `At most ${MAX_NOTIFY_EMAILS} notification emails are allowed` })
    }
  }

  await setReportApprovers(ids)
  if (notifyEmails !== undefined) {
    await setReportNotifyEmails(notifyEmails)
  }
  return { approvers: ids, ...(notifyEmails !== undefined ? { notify_emails: notifyEmails } : {}) }
})
