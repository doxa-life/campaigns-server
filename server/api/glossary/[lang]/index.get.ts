import { getLanguageByCode, getLanguageEntries } from '#server/database/glossary'
import { buildGlossaryExport, renderGlossaryMarkdown } from '#server/utils/glossary-export'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * GET /api/glossary/:lang — the approved terminology for a language.
 * `?format=markdown` returns the same content as a document.
 * `?download=1` returns it as a file attachment instead of a readable response.
 *
 * Unreviewed drafts are included and labelled: a term applied consistently is
 * cheap to correct once a reviewer rules on it, while a term with no glossary
 * entry drifts differently in every file.
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'lang') || ''
  const query = getQuery(event)
  const format = String(query.format || 'json')
  const download = query.download !== undefined && query.download !== '0' && query.download !== 'false'

  try {
    const language = await getLanguageByCode(code)
    if (!language) {
      throw createError({ statusCode: 404, statusMessage: `No glossary for language "${code}"` })
    }

    const data = buildGlossaryExport(language, await getLanguageEntries(language.id))
    const markdown = format === 'markdown' || format === 'md'

    if (download) {
      // The code comes from the stored record, so nothing user-supplied reaches the header.
      const filename = `glossary-${data.language.code}.${markdown ? 'md' : 'json'}`
      setHeader(event, 'content-disposition', `attachment; filename="${filename}"`)
    }

    if (markdown) {
      setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
      return renderGlossaryMarkdown(data)
    }
    return data
  } catch (error) {
    handleApiError(error, 'Failed to load the glossary')
  }
})
