import { listLanguages } from '#server/database/glossary'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * GET /api/glossary — the languages the glossary covers.
 *
 * Public: these terms are the published definitions of the site's own
 * vocabulary, and everyone who translates a surface needs them.
 */
export default defineEventHandler(async () => {
  try {
    const languages = await listLanguages()
    return {
      languages: languages.map(language => ({
        code: language.code,
        name_en: language.name_en,
        name_local: language.name_local,
        text_direction: language.text_direction,
        term_count: language.term_count,
        confirmed_count: language.confirmed_count
      }))
    }
  } catch (error) {
    handleApiError(error, 'Failed to load glossary languages')
  }
})
