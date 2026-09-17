import { listLanguages } from '#server/database/glossary'
import { LANGUAGES } from '../../../../../config/languages'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * GET /api/admin/glossary/languages — every glossary language with its review
 * progress.
 *
 * `registered_in_code` says whether the language also exists in
 * config/languages.ts. Glossary work starts long before that entry is added, so
 * the two lists differ on purpose and the page shows which is which.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  try {
    const registered = new Set(LANGUAGES.map(language => language.code))
    const languages = await listLanguages()
    return {
      languages: languages.map(language => ({
        ...language,
        registered_in_code: registered.has(language.code)
      }))
    }
  } catch (error) {
    handleApiError(error, 'Failed to load glossary languages')
  }
})
