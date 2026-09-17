import { getLanguageByCode, deleteLanguage } from '#server/database/glossary'
import { clearGlossaryCache } from '#server/utils/openrouter'
import { handleApiError } from '#server/utils/api-helpers'

/** DELETE /api/admin/glossary/languages/:code — removes its wording and review passes. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') || ''

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    await deleteLanguage(language.id)
    clearGlossaryCache(code)
    logDelete('glossary_languages', language.id, auth.userId, { code })
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete the language')
  }
})
