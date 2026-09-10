import { getPortfolioBySlugOr404, contextTransaction } from '#server/database/context-portfolios'
import { addSection, type AddSectionInput } from '#server/database/context-sections'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/context/portfolios/:slug/sections — add a section.
 * Body is either { key } for a built-in from the catalog, or
 * { title, description?, order? } for a custom section keyed by its title.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.manage')
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const body = await readBody<{ key?: string, title?: string, description?: string, order?: number }>(event)

  let input: AddSectionInput
  if (body?.key) {
    input = { key: String(body.key).trim() }
  } else if (body?.title) {
    const title = String(body.title).trim()
    if (!title || title.length > 120) {
      throw createError({ statusCode: 400, statusMessage: 'Title must be 1-120 characters' })
    }
    const description = body.description ? String(body.description).trim() : undefined
    if (description && description.length > 500) {
      throw createError({ statusCode: 400, statusMessage: 'Description must be at most 500 characters' })
    }
    input = { title, description, order: body.order }
  } else {
    throw createError({ statusCode: 400, statusMessage: 'Provide either a built-in key or a title for a custom section' })
  }

  try {
    const section = await contextTransaction(tx => addSection(portfolio.id, input, auth.userId, tx))
    logCreate('context_section_definitions', section.id, auth.userId, {
      portfolio_id: portfolio.id, key: section.key, title: section.title
    })
    return section
  } catch (error) {
    handleApiError(error, 'Failed to add section', 400)
  }
})
