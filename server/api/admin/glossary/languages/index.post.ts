import { createLanguage, getLanguageByCode } from '#server/database/glossary'
import { populateLanguageTerms, populateLanguageChrome } from '#server/utils/glossary-populate'
import { isOpenRouterConfigured } from '#server/utils/openrouter'
import { handleApiError } from '#server/utils/api-helpers'

const CODE_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i

/**
 * POST /api/admin/glossary/languages — start a language.
 * Body: { code, name_en, name_local?, text_direction?, draft? }
 *
 * Unless `draft` is false the new language is populated straight away: every
 * term gets a proposed wording and the reviewer page is translated, so the
 * first reviewer opens a complete form rather than a blank one. A drafting
 * failure leaves the language in place to be populated again.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const body = await readBody<{
    code?: string
    name_en?: string
    name_local?: string
    text_direction?: 'ltr' | 'rtl'
    draft?: boolean
  }>(event)

  const code = (body?.code || '').trim().toLowerCase()
  const nameEn = (body?.name_en || '').trim()

  if (!CODE_PATTERN.test(code)) {
    throw createError({ statusCode: 400, statusMessage: 'Code must be a language code such as "fi" or "pt-br"' })
  }
  if (!nameEn || nameEn.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'English name is required and must be at most 100 characters' })
  }
  if (body?.text_direction && !['ltr', 'rtl'].includes(body.text_direction)) {
    throw createError({ statusCode: 400, statusMessage: 'text_direction must be "ltr" or "rtl"' })
  }
  if (await getLanguageByCode(code)) {
    throw createError({ statusCode: 409, statusMessage: `The glossary already has a language with code "${code}"` })
  }

  let language
  try {
    language = await createLanguage({
      code,
      name_en: nameEn,
      name_local: body?.name_local?.trim(),
      text_direction: body?.text_direction
    })
    logCreate('glossary_languages', language.id, auth.userId, { code, name_en: nameEn })
  } catch (error) {
    handleApiError(error, 'Failed to add the language', 400)
  }

  if (body?.draft === false || !isOpenRouterConfigured()) {
    return { language, drafted: 0, draft_error: isOpenRouterConfigured() ? null : 'OpenRouter is not configured' }
  }

  try {
    const [terms] = await Promise.all([
      populateLanguageTerms(language),
      populateLanguageChrome(language)
    ])
    return { language: await getLanguageByCode(code), drafted: terms.drafted, draft_error: null }
  } catch (error: any) {
    console.error(`[Glossary] drafting ${code} failed:`, error)
    return { language, drafted: 0, draft_error: error?.message || 'Drafting failed' }
  }
})
