import { listRevisions } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/** GET /api/admin/glossary/translations/:id/revisions — the wording's history, newest first. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  const id = getUuidParam(event, 'id')

  try {
    return { revisions: await listRevisions(id) }
  } catch (error) {
    handleApiError(error, 'Failed to load the history')
  }
})
