import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'

/** GET /api/admin/context/portfolios/:slug — one portfolio. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  return await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')
})
