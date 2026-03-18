import { subscriberService } from '../database/subscribers'
import { requireFormApiKey } from '../utils/form-api-key'
import { handleApiError } from '#server/utils/api-helpers'
import { notifyContactRecipients } from '../utils/contact-notification-email'

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody<{
    name?: string
    email: string
    message: string
  }>(event)

  const name = body.name?.trim() || ''
  const email = body.email?.trim().toLowerCase()
  const message = body.message?.trim()

  if (!email || !message) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: email, message' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  try {
    const { subscriber } = await subscriberService.findOrCreateSubscriber({
      email,
      name: name || email,
    })

    logCreate('subscribers', String(subscriber.id), event, {
      source: 'Contact Form',
      message: 'Contact form submitted',
      form_values: { name, email, message },
    })

    notifyContactRecipients({
      name: name || email,
      email,
      message,
      subscriberId: subscriber.id,
    }).catch(err => console.error('Failed to notify contact recipients:', err))

    return { success: true }
  } catch (error: any) {
    handleApiError(error, 'Failed to process contact form', 500)
  }
})
