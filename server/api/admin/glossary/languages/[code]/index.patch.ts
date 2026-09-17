import { getLanguageByCode, updateLanguage } from '#server/database/glossary'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PATCH /api/admin/glossary/languages/:code
 * Body: { name_en?, name_local?, text_direction?, bible_id?, bible_translation?, bible_translation_note? }
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') || ''
  const body = await readBody<Record<string, any>>(event)

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    if (body?.text_direction && !['ltr', 'rtl'].includes(body.text_direction)) {
      throw createError({ statusCode: 400, statusMessage: 'text_direction must be "ltr" or "rtl"' })
    }

    const updated = await updateLanguage(language.id, {
      name_en: body?.name_en?.trim(),
      name_local: body?.name_local?.trim(),
      text_direction: body?.text_direction,
      bible_id: body?.bible_id,
      bible_translation: body?.bible_translation,
      bible_translation_note: body?.bible_translation_note
    })
    logUpdate('glossary_languages', language.id, auth.userId, body)
    return updated
  } catch (error) {
    handleApiError(error, 'Failed to update the language', 400)
  }
})
