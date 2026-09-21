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
 *
 * `bible_id_in_code` is the edition the app actually fetches verses with, next
 * to the `bible_id` the glossary records as the one reviewers asked for. The
 * two agree only once someone puts the reviewed edition into code.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  try {
    const registered = new Map(LANGUAGES.map(language => [language.code, language]))
    const languages = await listLanguages()
    return {
      languages: languages.map(language => {
        const inCode = registered.get(language.code)
        return {
          ...language,
          registered_in_code: Boolean(inCode),
          bible_id_in_code: inCode?.bibleId ?? null,
          bible_label_in_code: inCode?.bibleLabel ?? inCode?.bibleId ?? null
        }
      })
    }
  } catch (error) {
    handleApiError(error, 'Failed to load glossary languages')
  }
})
