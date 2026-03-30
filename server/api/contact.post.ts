import { subscriberService } from '../database/subscribers'
import { contactMethodService } from '../database/contact-methods'
import { requireFormApiKey } from '../utils/form-api-key'
import { handleApiError } from '#server/utils/api-helpers'
import { notifyContactRecipients } from '../utils/contact-notification-email'
import { sendContactVerificationEmail } from '../utils/contact-verification-email'
import countries from 'i18n-iso-countries'

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody<{
    name?: string
    email: string
    message: string
    country?: string
    consent_doxa_general?: boolean
  }>(event)

  const name = body.name?.trim() || ''
  const email = body.email?.trim().toLowerCase()
  const message = body.message?.trim()
  const rawCountry = body.country?.trim().toUpperCase() || null
  const country = rawCountry
    ? (rawCountry.length === 3 ? countries.alpha3ToAlpha2(rawCountry) : rawCountry) || null
    : null

  if (!email || !message) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: email, message' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  try {
    const { subscriber, isNew } = await subscriberService.findOrCreateSubscriber({
      email,
      name: name || email,
      country,
    })

    if (!isNew && country && subscriber.country !== country) {
      await subscriberService.updateSubscriber(subscriber.id, { country })
    }

    await subscriberService.addSource(subscriber.id, 'contact')

    if (body.consent_doxa_general) {
      const emailContact = await contactMethodService.getByValue('email', email)
      if (emailContact) {
        await contactMethodService.updateDoxaConsent(emailContact.id, true)

        if (!emailContact.verified) {
          const token = await contactMethodService.generateVerificationToken(emailContact.id)
          sendContactVerificationEmail(email, token, name || email)
            .catch(err => console.error('Failed to send contact verification email:', err))
        }
      }
    }

    logCreate('subscribers', String(subscriber.id), event, {
      source: 'Contact Form',
      message: 'Contact form submitted',
      form_values: { name, email, message, country, consent_doxa_general: body.consent_doxa_general ?? false },
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
