import { setPassReviewer } from '#server/database/glossary'
import { requireReviewPass, limitReviewWrites } from '#server/utils/glossary-review'
import { handleApiError } from '#server/utils/api-helpers'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * PATCH /api/glossary/review/:token/reviewer — record who is doing this pass.
 * Body: { reviewer_name, reviewer_email? }
 *
 * The name is the only attribution an edit through a magic link carries, so it
 * is asked for before any term can be changed. The email is optional and is
 * how the team comes back about a flagged term.
 */
export default defineEventHandler(async (event) => {
  try {
    const { pass } = await requireReviewPass(event)
    await limitReviewWrites(event, pass)

    const body = await readBody<{ reviewer_name?: string; reviewer_email?: string | null }>(event)

    const name = (body?.reviewer_name || '').trim()
    if (!name || name.length > 120) {
      throw createError({ statusCode: 400, statusMessage: 'Please enter your name (up to 120 characters)' })
    }

    let email: string | null | undefined
    if (body?.reviewer_email !== undefined) {
      email = (body.reviewer_email || '').trim() || null
      if (email && (email.length > 255 || !EMAIL_PATTERN.test(email))) {
        throw createError({ statusCode: 400, statusMessage: 'That email address does not look right' })
      }
    }

    return await setPassReviewer(pass.id, { name, email })
  } catch (error) {
    handleApiError(error, 'Failed to save your details', 400)
  }
})
