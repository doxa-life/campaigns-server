import { setPassReviewerName } from '#server/database/glossary'
import { requireReviewPass, limitReviewWrites } from '#server/utils/glossary-review'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PATCH /api/glossary/review/:token/name — record who is doing this pass.
 * Body: { reviewer_name }
 *
 * The name is the only attribution an edit through a magic link carries, so it
 * is asked for before any term can be changed.
 */
export default defineEventHandler(async (event) => {
  try {
    const { pass } = await requireReviewPass(event)
    await limitReviewWrites(event, pass)

    const body = await readBody<{ reviewer_name?: string }>(event)
    const name = (body?.reviewer_name || '').trim()
    if (!name || name.length > 120) {
      throw createError({ statusCode: 400, statusMessage: 'Please enter your name (up to 120 characters)' })
    }

    return await setPassReviewerName(pass.id, name)
  } catch (error) {
    handleApiError(error, 'Failed to save your name', 400)
  }
})
