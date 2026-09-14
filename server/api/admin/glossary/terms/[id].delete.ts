import { deleteTerm } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/** DELETE /api/admin/glossary/terms/:id — removes the term in every language. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')

  try {
    if (!(await deleteTerm(id))) {
      throw createError({ statusCode: 404, statusMessage: 'Term not found' })
    }
    logDelete('glossary_terms', id, auth.userId)
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete the term')
  }
})
