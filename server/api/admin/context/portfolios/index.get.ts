import { listPortfolios } from '#server/database/context-portfolios'

/** GET /api/admin/context/portfolios — every portfolio, by name. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  return { portfolios: await listPortfolios() }
})
