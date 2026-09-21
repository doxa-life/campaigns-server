import { reopenPass } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/** POST /api/admin/glossary/languages/:code/passes/:id/reopen — mark a submitted pass open again. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')

  try {
    const pass = await reopenPass(id)
    if (!pass) throw createError({ statusCode: 404, statusMessage: 'Review pass not found' })
    logUpdate('glossary_review_passes', id, auth.userId, { status: 'open' })
    return pass
  } catch (error) {
    handleApiError(error, 'Failed to reopen the review pass')
  }
})
