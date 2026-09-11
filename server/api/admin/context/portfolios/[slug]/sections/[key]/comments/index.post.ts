import { getPortfolioBySlugOr404, contextTransaction } from '#server/database/context-portfolios'
import { loadSection, saveSectionContent, requireKnownSection } from '#server/database/context-sections'
import { createComment } from '#server/database/context-comments'

/**
 * POST /api/admin/context/portfolios/:slug/sections/:key/comments
 * Body: { content, quoted_text, anchor_start, anchor_end }. Commenting on a
 * section that has never been saved creates its empty content row first, so the
 * comment has something to anchor to.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.edit')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const body = await readBody<{
    content?: string
    quoted_text?: string
    anchor_start?: number
    anchor_end?: number
  }>(event)

  const content = (body?.content || '').trim()
  const quotedText = body?.quoted_text || ''
  const anchorStart = Number(body?.anchor_start)
  const anchorEnd = Number(body?.anchor_end)

  if (!content || content.length > 8000) {
    throw createError({ statusCode: 400, statusMessage: 'Comment must be 1-8000 characters' })
  }
  if (!quotedText || quotedText.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'quoted_text must be 1-2000 characters' })
  }
  if (!Number.isInteger(anchorStart) || !Number.isInteger(anchorEnd) || anchorStart < 0 || anchorEnd < anchorStart) {
    throw createError({ statusCode: 400, statusMessage: 'anchor_start and anchor_end must be integers with anchor_end >= anchor_start' })
  }

  await requireKnownSection(portfolio.id, key)

  const comment = await contextTransaction(async (tx) => {
    let section = await loadSection(portfolio.id, key, tx)
    if (!section) {
      const created = await saveSectionContent(portfolio.id, key, '', auth.userId, { source: 'user' }, tx)
      section = created.section
    }
    return await createComment({
      sectionId: section.id,
      authorId: auth.userId,
      content,
      quotedText,
      anchorStart,
      anchorEnd
    }, tx)
  })

  logCreate('context_section_comments', comment!.id as string, auth.userId, { portfolio_id: portfolio.id, key })
  return comment
})
