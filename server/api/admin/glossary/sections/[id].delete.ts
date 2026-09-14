import { deleteSection } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/** DELETE /api/admin/glossary/sections/:id — removes the section and its terms. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')

  try {
    if (!(await deleteSection(id))) {
      throw createError({ statusCode: 404, statusMessage: 'Section not found' })
    }
    logDelete('glossary_sections', id, auth.userId)
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete the section')
  }
})
