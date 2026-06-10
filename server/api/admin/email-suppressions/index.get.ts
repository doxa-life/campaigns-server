import { contactMethodService } from '#server/database/contact-methods'

// Read the suppressed email addresses (hard bounces / complaints / unsubscribes
// reported by Mailgun). Lets an admin spot a false positive and clear it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.view')

  const suppressions = await contactMethodService.listSuppressed()
  return { suppressions }
})
