import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { isKnownSectionKey } from '#server/database/context-sections'
import { createConversation } from '#server/database/context-assistant'

/**
 * POST /api/admin/context/assistant/conversations — start a chat in a scope.
 * Body: { portfolio?: slug, section?: key }.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.view')
  const body = await readBody<{ portfolio?: string, section?: string }>(event) ?? {}

  const slug = body.portfolio ? String(body.portfolio).trim() : ''
  const sectionKey = body.section ? String(body.section).trim() : ''
  if (sectionKey && !slug) {
    throw createError({ statusCode: 400, statusMessage: 'A section scope needs a portfolio' })
  }

  const portfolio = slug ? await getPortfolioBySlugOr404(slug) : null
  if (portfolio && sectionKey && !(await isKnownSectionKey(portfolio.id, sectionKey))) {
    throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${sectionKey}` })
  }

  const conversation = await createConversation(auth.userId, {
    portfolioId: portfolio?.id ?? null,
    sectionKey: portfolio && sectionKey ? sectionKey : null
  })
  return { conversation }
})
