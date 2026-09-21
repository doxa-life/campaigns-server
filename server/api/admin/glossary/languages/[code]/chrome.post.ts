import { getLanguageByCode } from '#server/database/glossary'
import { populateLanguageChrome } from '#server/utils/glossary-populate'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/glossary/languages/:code/chrome — re-translate the reviewer
 * page's instructions and labels. Run after editing the English wording or
 * adding a section.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') || ''

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    await populateLanguageChrome(language)
    logUpdate('glossary_languages', language.id, auth.userId, { chrome: 'redrafted' })
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to translate the review page', 400)
  }
})
