import { revertLanguageNotes } from '#server/database/glossary'
import { clearGlossaryCache } from '#server/utils/openrouter'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/glossary/note-revisions/:id/revert — restore an earlier set
 * of a language's translation rules, recorded as a new change rather than by
 * deleting what came after it.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')

  try {
    const language = await revertLanguageNotes(id, auth.display_name || auth.email)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Revision not found' })

    clearGlossaryCache(language.code)
    logUpdate('glossary_languages', language.id, auth.userId, { notes: 'reverted', revision_id: id })
    return { notes: language.notes }
  } catch (error) {
    handleApiError(error, 'Failed to restore the notes', 400)
  }
})
