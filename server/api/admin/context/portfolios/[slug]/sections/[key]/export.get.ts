import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { getPortfolioSections, loadSection, isKnownSectionKey } from '#server/database/context-sections'
import { formatSectionMarkdown } from '#server/utils/context/export'

/** GET /api/admin/context/portfolios/:slug/sections/:key/export — one section as markdown. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  if (!(await isKnownSectionKey(portfolio.id, key))) {
    throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })
  }

  const definitions = await getPortfolioSections(portfolio.id)
  const section = await loadSection(portfolio.id, key)

  setHeader(event, 'Content-Type', 'text/markdown')
  setHeader(event, 'Content-Disposition', `attachment; filename="${key}.md"`)
  return formatSectionMarkdown(definitions.find(d => d.key === key)?.title ?? key, section?.content ?? '')
})
