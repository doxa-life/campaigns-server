import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { loadSection, requireKnownSection } from '#server/database/context-sections'
import { getReply, deleteReply } from '#server/database/context-comments'
import { roleService } from '#server/database/roles'

/** DELETE .../comments/:id/replies/:replyId — the author, or anyone who manages context. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.edit')
  const key = getRouterParam(event, 'key') ?? ''
  const commentId = getRouterParam(event, 'id') ?? ''
  const replyId = getRouterParam(event, 'replyId') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  await requireKnownSection(portfolio.id, key)
  const section = await loadSection(portfolio.id, key)
  if (!section) throw createError({ statusCode: 404, statusMessage: 'Section not found' })

  const reply = await getReply(replyId, commentId, section.id)
  if (!reply) throw createError({ statusCode: 404, statusMessage: 'Reply not found' })

  if (reply.author_id !== auth.userId && !(await roleService.userHasPermission(auth.userId, 'context.manage'))) {
    throw createError({ statusCode: 403, statusMessage: 'Only the author can delete this reply' })
  }

  await deleteReply(reply.id)
  logDelete('context_section_comment_replies', reply.id, auth.userId, {
    portfolio_id: portfolio.id, comment_id: reply.comment_id
  })
  return { success: true, id: reply.id }
})
