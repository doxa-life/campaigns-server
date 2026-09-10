import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { loadSection, listSectionVersions, requireKnownSection } from '#server/database/context-sections'

/** GET /api/admin/context/portfolios/:slug/sections/:key/versions — newest first. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  await requireKnownSection(portfolio.id, key)
  const section = await loadSection(portfolio.id, key)
  if (!section) return { versions: [] }

  return { versions: await listSectionVersions(section.id) }
})
