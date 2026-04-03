import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'subscribers.edit')

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
    country?: string | null
    sources?: string[]
  }>(event)

  const changes: Record<string, { from: any; to: any }> = {}

  const subscriberUpdates: { name?: string; preferred_language?: string; role?: string | null; country?: string | null; sources?: string[] } = {}
  if (body.name !== undefined && body.name !== subscriber.name) {
    subscriberUpdates.name = body.name
    changes.name = { from: subscriber.name, to: body.name }
  }
  if (body.preferred_language !== undefined && body.preferred_language !== subscriber.preferred_language) {
    subscriberUpdates.preferred_language = body.preferred_language
    changes.preferred_language = { from: subscriber.preferred_language, to: body.preferred_language }
  }
  if (body.role !== undefined) {
    subscriberUpdates.role = body.role
  }
  if (body.country !== undefined) {
    const newCountry = body.country?.trim()?.toUpperCase() || null
    if (newCountry !== subscriber.country) {
      subscriberUpdates.country = newCountry
      changes.country = { from: subscriber.country, to: newCountry }
    }
  }
  if (body.sources !== undefined) {
    const sorted = [...body.sources].sort()
    const currentSorted = [...subscriber.sources].sort()
    if (JSON.stringify(sorted) !== JSON.stringify(currentSorted)) {
      subscriberUpdates.sources = body.sources
      changes.sources = { from: subscriber.sources, to: body.sources }
    }
  }

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
      changes.email = { from: oldEmail, to: newEmail }
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
      changes.phone = { from: oldPhone, to: newPhone }
      if (newPhone && currentPhone) {
        await contactMethodService.updateContactMethod(currentPhone.id, { value: newPhone })
      } else if (newPhone && !currentPhone) {
        await contactMethodService.addContactMethod(subscriber.id, 'phone', newPhone)
      } else if (!newPhone && currentPhone) {
        await contactMethodService.removeContactMethod(currentPhone.id)
      }
    }
  }

  if (Object.keys(changes).length > 0) {
    logUpdate('subscribers', String(id), event, { changes })
  }

  return { success: true }
})
