import { getLanguageByCode, writeTranslation, type TranslationStatus } from '#server/database/glossary'
import { clearGlossaryCache } from '#server/utils/openrouter'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

const STATUSES: TranslationStatus[] = ['draft', 'confirmed', 'flagged']

/**
 * PATCH /api/admin/glossary/languages/:code/terms/:termId — an admin edit of
 * one term's wording. Body: { value?, acronym?, status?, note? }
 *
 * An empty acronym, or the English one, means the language uses the English
 * acronym; only a language's own is stored.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') || ''
  const termId = getUuidParam(event, 'termId')
  const body = await readBody<{
    value?: string
    acronym?: string | null
    status?: TranslationStatus
    note?: string | null
  }>(event)

  if (body?.status !== undefined && !STATUSES.includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: 'status must be draft, confirmed, or flagged' })
  }
  if (body?.acronym != null && body.acronym.length > 20) {
    throw createError({ statusCode: 400, statusMessage: 'An acronym must be at most 20 characters' })
  }

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    const translation = await writeTranslation(
      language.id,
      termId,
      { value: body?.value, acronym: body?.acronym, status: body?.status, note: body?.note },
      { name: auth.display_name || auth.email, source: 'admin' }
    )
    clearGlossaryCache(code)
    logUpdate('glossary_translations', translation.id, auth.userId, { code, term_id: termId })
    return translation
  } catch (error) {
    handleApiError(error, 'Failed to save the term', 400)
  }
})
