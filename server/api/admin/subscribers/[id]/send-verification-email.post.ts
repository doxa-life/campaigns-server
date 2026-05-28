import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { sendContactVerificationEmail } from '#server/utils/contact-verification-email'
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

    const token = await contactMethodService.generateVerificationToken(emailContact.id)

    const success = await sendContactVerificationEmail(
      emailContact.value,
      token,
      subscriber.name,
      subscriber.preferred_language,
      'admin'
    )

    if (!success) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to send verification email' })
    }

    logUpdate('subscribers', String(id), event, {
      source: 'Admin',
      message: `Verification email sent: ${emailContact.value}`
    })

    return {
      message: `Verification email sent to ${emailContact.value}`
    }
  } catch (error) {
    handleApiError(error, 'Failed to send verification email')
  }
})
