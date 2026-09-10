import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { loadSection, requireKnownSection } from '#server/database/context-sections'
import { listComments } from '#server/database/context-comments'

/**
 * GET /api/admin/context/portfolios/:slug/sections/:key/comments
 * Query: include_resolved=true also returns resolved comments.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')
  const includeResolved = String(getQuery(event).include_resolved ?? '').toLowerCase() === 'true'

  await requireKnownSection(portfolio.id, key)
  const section = await loadSection(portfolio.id, key)
  if (!section) return { comments: [] }

  return {
    section_id: section.id,
    comments: await listComments(section.id, section.content, includeResolved)
  }
})
