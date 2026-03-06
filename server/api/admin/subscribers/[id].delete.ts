import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')

  const subscriber = await subscriberService.getSubscriberById(id)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  }

  // Remove contact methods first
  const contacts = await contactMethodService.getSubscriberContactMethods(id)
  for (const contact of contacts) {
    await contactMethodService.removeContactMethod(contact.id)
  }

  await subscriberService.deleteSubscriber(id)

  return { success: true }
})
