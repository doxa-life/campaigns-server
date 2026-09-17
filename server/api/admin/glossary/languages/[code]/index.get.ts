import { getLanguageByCode, getLanguageEntries, listPasses } from '#server/database/glossary'
import { getBollsTranslations } from '#server/utils/bolls-languages'
import { GLOSSARY_CHROME_EN, fillChrome } from '../../../../../../config/glossary-chrome'
import { LANGUAGES } from '../../../../../../config/languages'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * GET /api/admin/glossary/languages/:code — one language with every term, its
 * review passes, and the bolls.life editions available for it.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  const code = getRouterParam(event, 'code') || ''

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    const [entries, passes, bibleTranslations] = await Promise.all([
      getLanguageEntries(language.id),
      listPasses(language.id),
      getBollsTranslations(language.name_en)
    ])

    return {
      language: {
        ...language,
        registered_in_code: LANGUAGES.some(candidate => candidate.code === language.code)
      },
      entries,
      passes,
      bible_translations: bibleTranslations,
      chrome_en: fillChrome(GLOSSARY_CHROME_EN, language.name_en)
    }
  } catch (error) {
    handleApiError(error, 'Failed to load the language')
  }
})
