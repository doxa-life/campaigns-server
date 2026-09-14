import { getLanguageByCode } from '#server/database/glossary'
import { populateLanguageTerms, populateLanguageChrome } from '#server/utils/glossary-populate'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/glossary/languages/:code/populate — draft the terms that have
 * no wording yet. Body: { redraft_all?, chrome? }
 *
 * `redraft_all` also replaces drafted and flagged wording; a confirmed term is
 * never overwritten.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') || ''
  const body = await readBody<{ redraft_all?: boolean; chrome?: boolean }>(event)

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    const result = await populateLanguageTerms(language, { redraftAll: body?.redraft_all })
    if (body?.chrome) await populateLanguageChrome(language)

    logUpdate('glossary_languages', language.id, auth.userId, { populated: result.drafted })
    return result
  } catch (error) {
    handleApiError(error, 'Failed to draft the glossary', 400)
  }
})
