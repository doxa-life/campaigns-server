import { requireFormApiKey } from '../utils/form-api-key'
import { handleApiError } from '#server/utils/api-helpers'
import { submitContactMessage } from '../utils/submit-contact'
import countries from 'i18n-iso-countries'

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody<{
    name?: string
    email: string
    message: string
    country?: string
    consent_doxa_general?: boolean
    language?: string
  }>(event)

  const language = body.language?.trim() || 'en'
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
    await submitContactMessage(event, {
      name,
      email,
      message,
      country,
      language,
      consentDoxaGeneral: body.consent_doxa_general,
    })

    return { success: true }
  } catch (error: any) {
    handleApiError(error, 'Failed to process contact form', 500)
  }
})
