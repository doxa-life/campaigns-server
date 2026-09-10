import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { listSectionsWithMeta } from '#server/database/context-sections'

/** GET /api/admin/context/portfolios/:slug/sections — sections with content metadata. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')
  return {
    portfolio_id: portfolio.id,
    sections: await listSectionsWithMeta(portfolio.id)
  }
})
