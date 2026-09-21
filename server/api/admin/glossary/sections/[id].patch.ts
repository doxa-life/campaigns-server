import { updateSection } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/** PATCH /api/admin/glossary/sections/:id — Body: { title?, intro?, position? } */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')
  const body = await readBody<{ title?: string; intro?: string; position?: number }>(event)

  try {
    const section = await updateSection(id, {
      title: body?.title?.trim(),
      intro: body?.intro?.trim(),
      position: body?.position
    })
    if (!section) throw createError({ statusCode: 404, statusMessage: 'Section not found' })
    logUpdate('glossary_sections', id, auth.userId, body as Record<string, any>)
    return section
  } catch (error) {
    handleApiError(error, 'Failed to update the section', 400)
  }
})
