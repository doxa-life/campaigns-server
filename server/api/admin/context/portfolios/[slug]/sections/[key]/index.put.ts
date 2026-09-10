import { getPortfolioBySlugOr404, contextTransaction } from '#server/database/context-portfolios'
import { saveSectionContent } from '#server/database/context-sections'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PUT /api/admin/context/portfolios/:slug/sections/:key — save section content.
 * The section row and its new version row are written together.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.edit')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const body = await readBody<{ content?: string }>(event)
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'content is required' })
  }

  try {
    const { section, versionId } = await contextTransaction(tx => saveSectionContent(
      portfolio.id, key, body.content!, auth.userId, { source: 'user' }, tx
    ))

    logUpdate('context_sections', section.id, auth.userId, {
      portfolio_id: portfolio.id, key, version_id: versionId
    })

    return {
      id: section.id,
      portfolio_id: section.portfolio_id,
      key: section.section_key,
      content: section.content,
      last_edited_at: section.last_edited_at,
      last_edited_by: section.last_edited_by,
      version_id: versionId
    }
  } catch (error) {
    handleApiError(error, 'Failed to save section')
  }
})
