import { getPortfolioBySlugOr404, updatePortfolio, type UpdatePortfolioPatch } from '#server/database/context-portfolios'

/** PATCH /api/admin/context/portfolios/:slug — rename or recolor a portfolio. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.edit')
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const body = await readBody<{ name?: string, color?: string | null }>(event)
  const patch: UpdatePortfolioPatch = {}

  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name || name.length > 120) {
      throw createError({ statusCode: 400, statusMessage: 'Name must be 1-120 characters' })
    }
    patch.name = name
  }
  if (body?.color !== undefined) {
    const color = body.color === null ? null : String(body.color).trim()
    if (color !== null && color.length > 20) {
      throw createError({ statusCode: 400, statusMessage: 'Color must be at most 20 characters' })
    }
    patch.color = color
  }

  const updated = await updatePortfolio(portfolio.id, patch)
  logUpdate('context_portfolios', portfolio.id, auth.userId, { patch })
  return updated
})
