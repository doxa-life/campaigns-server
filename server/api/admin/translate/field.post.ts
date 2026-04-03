import { translateText, isDeepLConfigured } from '#server/utils/deepl'
import { LANGUAGES } from '~/utils/languages'
import { getErrorMessage } from '#server/utils/api-helpers'

/**
 * Translate text to multiple target languages
 *
 * POST /api/admin/translate/field
 *
 * Body:
 * - text: string - The text to translate
 * - targetLanguages: string[] - Language codes to translate TO
 * - sourceLanguage?: string - Language code to translate FROM (defaults to 'en')
 *
 * Returns:
 * - translations: Record<string, string> - Map of language code to translated text
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.edit')

  if (!isDeepLConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Translation service not configured. Please add DEEPL_API_KEY to environment.'
    })
  }

  const body = await readBody(event)

  if (!body.text || typeof body.text !== 'string' || body.text.trim() === '') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Text to translate is required'
    })
  }

  if (!body.targetLanguages || !Array.isArray(body.targetLanguages) || body.targetLanguages.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one target language is required'
    })
  }

  const { text, targetLanguages, sourceLanguage = 'en' } = body

  // Validate target languages are in our supported LANGUAGES
  const validLanguageCodes = LANGUAGES.map(l => l.code)
  const invalidLanguages = targetLanguages.filter((lang: string) => !validLanguageCodes.includes(lang))
  if (invalidLanguages.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid target languages: ${invalidLanguages.join(', ')}`
    })
  }

  const translations: Record<string, string> = {}
  const errors: Array<{ language: string; error: string }> = []

  for (const targetLanguage of targetLanguages) {
    // Skip if target is same as source
    if (targetLanguage === sourceLanguage) {
      continue
    }

    try {
      const translated = await translateText(text, targetLanguage, sourceLanguage)
      translations[targetLanguage] = translated
    } catch (error) {
      errors.push({
        language: targetLanguage,
        error: getErrorMessage(error)
      })
    }
  }

  return {
    success: errors.length === 0,
    translations,
    errors: errors.length > 0 ? errors : undefined
  }
})
