import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { loadSection, requireKnownSection } from '#server/database/context-sections'
import { setCommentResolved } from '#server/database/context-comments'

/** POST .../comments/:id/unresolve — Reopen a resolved comment. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.manage')
  const key = getRouterParam(event, 'key') ?? ''
  const commentId = getRouterParam(event, 'id') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  await requireKnownSection(portfolio.id, key)
  const section = await loadSection(portfolio.id, key)
  if (!section) throw createError({ statusCode: 404, statusMessage: 'Section not found' })

  const updated = await setCommentResolved(commentId, section.id, false, auth.userId)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })

  logUpdate('context_section_comments', commentId, auth.userId, { action: 'unresolve' })
  return updated
})
