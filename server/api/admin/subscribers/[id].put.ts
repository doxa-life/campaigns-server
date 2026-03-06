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

  const body = await readBody<{
    name?: string
    email?: string
    phone?: string
    preferred_language?: string
    role?: string | null
  }>(event)

  const subscriberUpdates: { name?: string; preferred_language?: string; role?: string | null } = {}
  if (body.name !== undefined) subscriberUpdates.name = body.name
  if (body.preferred_language !== undefined) subscriberUpdates.preferred_language = body.preferred_language
  if (body.role !== undefined) subscriberUpdates.role = body.role

  if (Object.keys(subscriberUpdates).length > 0) {
    await subscriberService.updateSubscriber(subscriber.id, subscriberUpdates)
  }

  const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
  const currentEmail = contacts.find(c => c.type === 'email')
  const currentPhone = contacts.find(c => c.type === 'phone')

  if (body.email !== undefined) {
    const newEmail = body.email?.trim()?.toLowerCase() || ''
    const oldEmail = currentEmail?.value?.toLowerCase() || ''
    if (newEmail !== oldEmail) {
      if (newEmail && currentEmail) {
        await contactMethodService.updateContactMethod(currentEmail.id, { value: newEmail })
      } else if (newEmail && !currentEmail) {
        await contactMethodService.addContactMethod(subscriber.id, 'email', newEmail)
      } else if (!newEmail && currentEmail) {
        await contactMethodService.removeContactMethod(currentEmail.id)
      }
    }
  }

  if (body.phone !== undefined) {
    const newPhone = body.phone?.trim() || ''
    const oldPhone = currentPhone?.value || ''
    if (newPhone !== oldPhone) {
      if (newPhone && currentPhone) {
        await contactMethodService.updateContactMethod(currentPhone.id, { value: newPhone })
      } else if (newPhone && !currentPhone) {
        await contactMethodService.addContactMethod(subscriber.id, 'phone', newPhone)
      } else if (!newPhone && currentPhone) {
        await contactMethodService.removeContactMethod(currentPhone.id)
      }
    }
  }

  return { success: true }
})
