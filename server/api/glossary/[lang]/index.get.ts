import { getLanguageByCode, getLanguageEntries } from '#server/database/glossary'
import { buildGlossaryExport, renderGlossaryMarkdown } from '#server/utils/glossary-export'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * GET /api/glossary/:lang — the approved terminology for a language.
 * `?format=markdown` returns the same content as a document.
 *
 * Unreviewed drafts are included and labelled: a term applied consistently is
 * cheap to correct once a reviewer rules on it, while a term with no glossary
 * entry drifts differently in every file.
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'lang') || ''
  const format = String(getQuery(event).format || 'json')

  try {
    const language = await getLanguageByCode(code)
    if (!language) {
      throw createError({ statusCode: 404, statusMessage: `No glossary for language "${code}"` })
    }

    const data = buildGlossaryExport(language, await getLanguageEntries(language.id))

    if (format === 'markdown' || format === 'md') {
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      return renderGlossaryMarkdown(data)
    }
    return data
  } catch (error) {
    handleApiError(error, 'Failed to load the glossary')
  }
})
