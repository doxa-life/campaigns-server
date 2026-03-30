/**
 * GET /api/contact/verify
 * Verify email address from contact form
 */
import { contactMethodService } from '../../database/contact-methods'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token is required'
    })
  }

  const result = await contactMethodService.verifyByToken(token)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: result.error || 'Verification failed'
    })
  }

  if (result.contactMethod && !result.alreadyVerified) {
    logUpdate('subscribers', String(result.contactMethod.subscriber_id), event, {
      source: 'Email Verification',
      message: `Email verified: ${result.contactMethod.value}`
    })
  }

  return {
    success: true,
    already_verified: result.alreadyVerified === true
  }
})
