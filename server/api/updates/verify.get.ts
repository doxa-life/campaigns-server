import { contactMethodService } from '../../database/contact-methods'

/**
 * GET /api/updates/verify?token=
 * Email verification link target for public suggestion submissions. Marking
 * the contact verified fires the contact.verified hook, which promotes the
 * reporter's held-back suggestions into the review queue.
 */
export default defineEventHandler(async (event) => {
  const token = String(getQuery(event).token || '')
  if (!token) {
    return sendRedirect(event, '/updates?verified=0')
  }

  const result = await contactMethodService.verifyByToken(token)
  return sendRedirect(event, result.success ? '/updates?verified=1' : '/updates?verified=0')
})
