import { regeneratePassToken } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/glossary/languages/:code/passes/:id/regenerate — issue a new
 * token, which stops the link already sent out from working.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')

  try {
    const pass = await regeneratePassToken(id)
    if (!pass) throw createError({ statusCode: 404, statusMessage: 'Review pass not found' })
    logUpdate('glossary_review_passes', id, auth.userId, { token: 'regenerated' })
    return pass
  } catch (error) {
    handleApiError(error, 'Failed to regenerate the review link')
  }
})
