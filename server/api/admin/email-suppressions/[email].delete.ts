import { contactMethodService } from '#server/database/contact-methods'

// Un-suppress an address (clear a false-positive bounce/complaint) so sends to it
// resume. The email is the URL-encoded path param.
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.send')

  const raw = getRouterParam(event, 'email')
  const email = raw ? decodeURIComponent(raw) : ''
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email' })
  }

  const cleared = await contactMethodService.clearSuppressionByEmail(email)
  if (!cleared) {
    throw createError({ statusCode: 404, statusMessage: 'Suppression not found' })
  }

  // Mirror the suppression entry on the contact's activity timeline when resolvable.
  if (cleared.subscriber_id) {
    logUpdate('subscribers', String(cleared.subscriber_id), user.userId, { badge: 'Email Restored', email: cleared.value })
  } else {
    logDelete('contact_methods', String(cleared.id), user.userId, { email: cleared.value })
  }
  return { success: true }
})
