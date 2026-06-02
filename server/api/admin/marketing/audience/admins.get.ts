import { marketingEmailService } from '#server/database/marketing-emails'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.view')

  const recipients = await marketingEmailService.getAdminRecipients()

  return {
    count: recipients.length,
    audience_type: 'admins'
  }
})
