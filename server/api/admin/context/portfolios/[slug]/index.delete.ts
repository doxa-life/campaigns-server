import { getPortfolioBySlugOr404, deletePortfolio } from '#server/database/context-portfolios'

/**
 * DELETE /api/admin/context/portfolios/:slug — delete a portfolio. Cascades to
 * its sections, versions, comments, and assistant chats.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.manage')
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  await deletePortfolio(portfolio.id)
  logDelete('context_portfolios', portfolio.id, auth.userId, { slug: portfolio.slug, name: portfolio.name })
  return { success: true, id: portfolio.id }
})
