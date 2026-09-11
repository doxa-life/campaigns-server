import { getPortfolioBySlugOr404, contextTransaction } from '#server/database/context-portfolios'
import { loadSection, getSectionVersion, saveSectionContent } from '#server/database/context-sections'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/context/portfolios/:slug/sections/:key/versions/:id/restore
 * Save the named version's content as the current content. This appends a new
 * version at the head — restoring is itself an edit.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.edit')
  const key = getRouterParam(event, 'key') ?? ''
  const versionId = getRouterParam(event, 'id') ?? ''
  const portfolio = await getPortfolioBySlugOr404(getRouterParam(event, 'slug') ?? '')

  const section = await loadSection(portfolio.id, key)
  if (!section) throw createError({ statusCode: 404, statusMessage: 'Section not found' })

  const version = await getSectionVersion(section.id, versionId)
  if (!version) throw createError({ statusCode: 404, statusMessage: 'Version not found' })

  try {
    const { section: updated, versionId: newVersionId } = await contextTransaction(tx => saveSectionContent(
      portfolio.id, key, version.content, auth.userId, { source: 'user' }, tx
    ))

    logUpdate('context_sections', section.id, auth.userId, {
      restored_from: version.id, new_version_id: newVersionId, key
    })

    return {
      id: updated.id,
      key: updated.section_key,
      content: updated.content,
      restored_from: version.id,
      version_id: newVersionId
    }
  } catch (error) {
    handleApiError(error, 'Failed to restore version')
  }
})
