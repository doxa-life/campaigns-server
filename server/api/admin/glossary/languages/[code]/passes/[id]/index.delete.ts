import { deletePass } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/**
 * DELETE /api/admin/glossary/languages/:code/passes/:id — remove a review pass.
 * The wording it produced stays; only the link and its label go.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')

  try {
    if (!(await deletePass(id))) {
      throw createError({ statusCode: 404, statusMessage: 'Review pass not found' })
    }
    logDelete('glossary_review_passes', id, auth.userId)
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete the review pass')
  }
})
