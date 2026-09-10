import { getPortfolioBySlugOr404 } from '#server/database/context-portfolios'
import { getPortfolioSections, loadSection, isKnownSectionKey } from '#server/database/context-sections'

/** GET /api/admin/context/portfolios/:slug/sections/:key — one section with its content. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  const key = getRouterParam(event, 'key') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  if (!(await isKnownSectionKey(portfolio.id, key))) {
    throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })
  }

  const section = await loadSection(portfolio.id, key)
  const definitions = await getPortfolioSections(portfolio.id)
  const definition = definitions.find(d => d.key === key)

  let lastEditedByName: string | null = null
  if (section?.last_edited_by) {
    const { userService } = await import('#server/database/users')
    const user = await userService.getUserById(section.last_edited_by)
    lastEditedByName = user?.display_name ?? null
  }

  return {
    portfolio_id: portfolio.id,
    key,
    title: definition?.title ?? key,
    description: definition?.description ?? '',
    is_custom: definition?.is_custom ?? false,
    content: section?.content ?? '',
    last_edited_at: section?.last_edited_at ?? null,
    last_edited_by: section?.last_edited_by ?? null,
    last_edited_by_name: lastEditedByName
  }
})
