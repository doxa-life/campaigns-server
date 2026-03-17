import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { connectionService } from '../../../database/connections'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')

  const subscriber = await subscriberService.getSubscriberById(id)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  }

  const contacts = await contactMethodService.getSubscriberContactMethods(id)
  const emailContact = contacts.find(c => c.type === 'email')
  const phoneContact = contacts.find(c => c.type === 'phone')

  // Remove subscriptions
  const subscriptions = await peopleGroupSubscriptionService.getSubscriberSubscriptions(id)
  for (const sub of subscriptions) {
    await peopleGroupSubscriptionService.deleteSubscription(sub.id)
  }

  // Remove connections (group memberships, etc.)
  await connectionService.deleteForEntity('subscriber', id)

  // Remove contact methods
  for (const contact of contacts) {
    await contactMethodService.removeContactMethod(contact.id)
  }

  await doAction('record.delete', 'subscriber', id)
  await subscriberService.deleteSubscriber(id)

  logDelete('subscribers', String(id), event, {
    deletedRecord: {
      name: subscriber.name,
      email: emailContact?.value,
      phone: phoneContact?.value
    }
  })

  return { success: true }
})
