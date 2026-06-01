import { contactMethodService } from '#server/database/contact-methods'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const q = String(getQuery(event).q ?? '').trim()
  const contacts = await contactMethodService.searchEmailContacts(q)

  return { contacts }
})
