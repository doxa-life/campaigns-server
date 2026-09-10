import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { deleteSection } from '#server/database/context-sections'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * DELETE /api/admin/context/portfolios/:slug/sections/:key — remove a section,
 * built-in or custom. Content saved under the key stays and resurfaces if the
 * section is added again.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.manage')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  try {
    const deleted = await deleteSection(portfolio.id, key)
    logDelete('context_section_definitions', deleted.id, auth.userId, { portfolio_id: portfolio.id, key })
    return { success: true, key, ...deleted }
  } catch (error) {
    handleApiError(error, 'Failed to remove section', 400)
  }
})
