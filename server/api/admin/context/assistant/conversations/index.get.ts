import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { listConversations } from '#server/database/context-assistant'

/**
 * GET /api/admin/context/assistant/conversations?portfolio=<slug>&section=<key>
 * The caller's own chats for one scope: both params mean a section, the
 * portfolio alone means that portfolio, neither means every portfolio.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.view')
  const query = getQuery(event)
  const slug = typeof query.portfolio === 'string' ? query.portfolio.trim() : ''
  const sectionKey = typeof query.section === 'string' ? query.section.trim() : ''

  const portfolio = slug ? await getPortfolioBySlugOr404(slug) : null
  const conversations = await listConversations(auth.userId, {
    portfolioId: portfolio?.id ?? null,
    sectionKey: portfolio && sectionKey ? sectionKey : null
  })
  return { conversations }
})
