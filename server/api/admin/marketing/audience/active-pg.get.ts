import { contactMethodService } from '#server/database/contact-methods'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.view')

  const contacts = await contactMethodService.getContactsWithActiveSubscription()

  return {
    count: contacts.length,
    audience_type: 'active_pg'
  }
})
