import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'subscribers.edit')

  const id = getIntParam(event, 'id')

  try {
    const subscriber = await subscriberService.getSubscriberById(id)
    if (!subscriber) {
      throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
    }

    const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
    const emailContact = contacts.find(c => c.type === 'email')

    if (!emailContact?.value) {
      throw createError({ statusCode: 400, statusMessage: 'Subscriber does not have an email address' })
    }

    if (emailContact.verified) {
      throw createError({ statusCode: 400, statusMessage: 'Email is already verified' })
    }

    await contactMethodService.markVerified(emailContact.id)

    logUpdate('subscribers', String(id), event, {
      source: 'Admin',
      message: `Email manually marked verified: ${emailContact.value}`
    })

    return {
      message: `${emailContact.value} marked as verified`
    }
  } catch (error) {
    handleApiError(error, 'Failed to mark email verified')
  }
})
