import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { connectionService } from '../../../database/connections'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')

  const subscriber = await subscriberService.getSubscriberById(id)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  }

  // Remove connections (group memberships, etc.)
  await connectionService.deleteForEntity('subscriber', id)

  // Remove contact methods
  const contacts = await contactMethodService.getSubscriberContactMethods(id)
  for (const contact of contacts) {
    await contactMethodService.removeContactMethod(contact.id)
  }

  await subscriberService.deleteSubscriber(id)

  return { success: true }
})
