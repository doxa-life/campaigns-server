import { getLanguageByCode, listLanguageNoteRevisions } from '#server/database/glossary'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * GET /api/admin/glossary/languages/:code/notes/revisions — every earlier state
 * of this language's translation rules, newest first.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  const code = getRouterParam(event, 'code') || ''

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })
    return { revisions: await listLanguageNoteRevisions(language.id) }
  } catch (error) {
    handleApiError(error, 'Failed to load the history')
  }
})
