import { createSection } from '#server/database/glossary'
import { handleApiError } from '#server/utils/api-helpers'

/** POST /api/admin/glossary/sections — add a section. Body: { title, intro? } */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const body = await readBody<{ title?: string; intro?: string }>(event)

  const title = (body?.title || '').trim()
  if (!title || title.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required and must be at most 200 characters' })
  }

  try {
    const section = await createSection({ title, intro: body?.intro?.trim() })
    logCreate('glossary_sections', section.id, auth.userId, { title })
    return section
  } catch (error) {
    handleApiError(error, 'Failed to create the section', 400)
  }
})
