import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { loadSection, requireKnownSection } from '#server/database/context-sections'
import { getComment, deleteComment } from '#server/database/context-comments'
import { roleService } from '#server/database/roles'

/**
 * DELETE .../comments/:id — remove a comment and its replies. The author can
 * delete their own; managing context lets anyone clean up.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.edit')
  const key = getRouterParam(event, 'key') ?? ''
  const commentId = getRouterParam(event, 'id') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  await requireKnownSection(portfolio.id, key)
  const section = await loadSection(portfolio.id, key)
  if (!section) throw createError({ statusCode: 404, statusMessage: 'Section not found' })

  const comment = await getComment(commentId, section.id)
  if (!comment) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })

  if (comment.author_id !== auth.userId && !(await roleService.userHasPermission(auth.userId, 'context.manage'))) {
    throw createError({ statusCode: 403, statusMessage: 'Only the author can delete this comment' })
  }

  await deleteComment(comment.id)
  logDelete('context_section_comments', comment.id, auth.userId, { portfolio_id: portfolio.id, section_id: section.id })
  return { success: true, id: comment.id }
})
