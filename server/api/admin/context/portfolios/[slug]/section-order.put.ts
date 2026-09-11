import { getPortfolioBySlugOr404, contextTransaction } from '#server/database/context-portfolios'
import { reorderSections } from '#server/database/context-sections'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PUT /api/admin/context/portfolios/:slug/section-order — set the position of
 * every section from a full list of keys. Sits beside `sections/` rather than
 * under it so the path can never shadow a section whose key is "section-order".
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.manage')
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const body = await readBody<{ keys?: string[] }>(event)
  if (!Array.isArray(body?.keys) || body.keys.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'keys must be a non-empty array of section keys' })
  }

  try {
    const sections = await contextTransaction(tx => reorderSections(portfolio.id, body.keys!, tx))
    logUpdate('context_portfolios', portfolio.id, auth.userId, { action: 'reorder_sections', keys: body.keys })
    return { sections }
  } catch (error) {
    handleApiError(error, 'Failed to reorder sections', 400)
  }
})
