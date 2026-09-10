import { createPortfolio, contextTransaction } from '#server/database/context-portfolios'
import { handleApiError } from '#server/utils/api-helpers'

const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,39}$/

/**
 * POST /api/admin/context/portfolios — create a portfolio.
 * Body: { name, color?, slug?, builtin_sections? }. Omitting builtin_sections
 * starts the portfolio with every catalog section; an empty array starts it
 * with none.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.manage')

  const body = await readBody<{
    name?: string
    color?: string | null
    slug?: string
    builtin_sections?: string[]
  }>(event)

  const name = (body?.name || '').trim()
  if (!name || name.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required and must be at most 120 characters' })
  }
  if (body?.slug !== undefined && !SLUG_PATTERN.test(body.slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Slug must be lowercase letters, digits, and hyphens, starting with a letter' })
  }
  if (body?.builtin_sections !== undefined && !Array.isArray(body.builtin_sections)) {
    throw createError({ statusCode: 400, statusMessage: 'builtin_sections must be an array of section keys' })
  }

  try {
    const portfolio = await contextTransaction(tx => createPortfolio({
      name,
      color: body?.color ?? null,
      slug: body?.slug,
      builtin_sections: body?.builtin_sections
    }, auth.userId, tx))

    logCreate('context_portfolios', portfolio.id, auth.userId, { slug: portfolio.slug, name: portfolio.name })
    return portfolio
  } catch (error) {
    handleApiError(error, 'Failed to create portfolio', 400)
  }
})
