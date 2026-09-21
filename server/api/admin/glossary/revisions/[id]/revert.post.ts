import { revertToRevision } from '#server/database/glossary'
import { clearGlossaryCache } from '#server/utils/openrouter'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/glossary/revisions/:id/revert — restore a prior wording by
 * writing it as a new change, so the history stays append-only.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')

  try {
    const translation = await revertToRevision(id, auth.display_name || auth.email)
    if (!translation) throw createError({ statusCode: 404, statusMessage: 'Revision not found' })
    clearGlossaryCache()
    logUpdate('glossary_translations', translation.id, auth.userId, { reverted_to: id })
    return translation
  } catch (error) {
    handleApiError(error, 'Failed to restore the wording')
  }
})
