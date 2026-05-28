import { contactMethodService } from '#server/database/contact-methods'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const contacts = await contactMethodService.getContactsWithDoxaConsentAndActiveSubscription()

  return {
    count: contacts.length,
    audience_type: 'doxa_active_pg'
  }
})
