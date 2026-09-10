import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { updateSectionDefinition, type UpdateSectionDefinitionPatch } from '#server/database/context-sections'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PATCH /api/admin/context/portfolios/:slug/sections/:key — change a section's
 * title, description, or position. The key is fixed once the section exists.
 * On a built-in section the stored values override the catalog wording.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.manage')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const body = await readBody<{ title?: string, description?: string, order?: number }>(event)
  const patch: UpdateSectionDefinitionPatch = {}

  if (body?.title !== undefined) {
    const title = String(body.title).trim()
    if (!title || title.length > 120) {
      throw createError({ statusCode: 400, statusMessage: 'Title must be 1-120 characters' })
    }
    patch.title = title
  }
  if (body?.description !== undefined) {
    const description = String(body.description).trim()
    if (description.length > 500) {
      throw createError({ statusCode: 400, statusMessage: 'Description must be at most 500 characters' })
    }
    patch.description = description
  }
  if (body?.order !== undefined) {
    const order = Number(body.order)
    if (!Number.isInteger(order) || order < 0) {
      throw createError({ statusCode: 400, statusMessage: 'Order must be a non-negative integer' })
    }
    patch.order = order
  }
  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  try {
    const section = await updateSectionDefinition(portfolio.id, key, patch)
    logUpdate('context_section_definitions', section.id, auth.userId, { portfolio_id: portfolio.id, key, patch })
    return section
  } catch (error) {
    handleApiError(error, 'Failed to update section', 400)
  }
})
