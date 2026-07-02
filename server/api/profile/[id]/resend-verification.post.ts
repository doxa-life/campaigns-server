/**
 * POST /api/profile/:id/resend-verification
 * Re-send the double opt-in verification email for one of the subscriber's email
 * contact methods. Keyed by contact_method_id (the app only ever sees redacted
 * addresses). Accepts the mobile app secret (X-App-Secret) or the form API key.
 * Enforces a short cooldown so the button can't be used to spam an inbox.
 */
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { sendContactVerificationEmail } from '#server/utils/contact-verification-email'
import { requireAppSecretOrFormApiKey } from '#server/utils/anon-signup-secret'
import { handleApiError } from '#server/utils/api-helpers'

const COOLDOWN_SECONDS = 60

export default defineEventHandler(async (event) => {
  requireAppSecretOrFormApiKey(event)

  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    throw createError({ statusCode: 400, statusMessage: 'Profile ID is required' })
  }

  const body = await readBody<{ contact_method_id?: number }>(event)
  const contactMethodId = Number(body?.contact_method_id)
  if (!Number.isInteger(contactMethodId)) {
    throw createError({ statusCode: 400, statusMessage: 'contact_method_id is required' })
  }

  try {
    const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
    if (!subscriber) {
      throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
    }

    const contactMethod = await contactMethodService.getById(contactMethodId)
    if (
      !contactMethod ||
      contactMethod.subscriber_id !== subscriber.id ||
      contactMethod.type !== 'email'
    ) {
      throw createError({ statusCode: 404, statusMessage: 'Email address not found' })
    }

    if (contactMethod.verified) {
      return { success: true, alreadyVerified: true }
    }

    // Cooldown: refuse if a verification email went out recently.
    if (contactMethod.verification_last_sent_at) {
      const elapsedMs = Date.now() - new Date(contactMethod.verification_last_sent_at).getTime()
      const remainingSeconds = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000)
      if (remainingSeconds > 0) {
        throw createError({
          statusCode: 429,
          statusMessage: 'Please wait before requesting another verification email',
          data: { retryAfterSeconds: remainingSeconds }
        })
      }
    }

    // Reuses a still-valid token; only mints a new one if none/expired.
    const token = await contactMethodService.regenerateVerificationToken(contactMethod.id)
    if (!token) {
      // Race: verified between the check above and here.
      return { success: true, alreadyVerified: true }
    }

    await sendContactVerificationEmail(
      contactMethod.value,
      token,
      subscriber.name,
      subscriber.preferred_language || 'en'
    )
    await contactMethodService.markVerificationSent(contactMethod.id)

    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to resend verification email')
  }
})
