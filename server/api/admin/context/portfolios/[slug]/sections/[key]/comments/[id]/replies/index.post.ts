import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { loadSection, requireKnownSection } from '#server/database/context-sections'
import { getComment, createReply } from '#server/database/context-comments'

/** POST .../comments/:id/replies — reply to a comment. */
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

  const body = await readBody<{ content?: string }>(event)
  const content = (body?.content || '').trim()
  if (!content || content.length > 8000) {
    throw createError({ statusCode: 400, statusMessage: 'Reply must be 1-8000 characters' })
  }

  const reply = await createReply(comment.id, auth.userId, content)
  logCreate('context_section_comment_replies', reply!.id as string, auth.userId, {
    portfolio_id: portfolio.id, comment_id: comment.id
  })
  return reply
})
