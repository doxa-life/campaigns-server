import { getEnglishGlossary } from '#server/database/glossary'
import { handleApiError } from '#server/utils/api-helpers'

/** GET /api/admin/glossary/english — the authoritative English glossary, by section. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  try {
    return { sections: await getEnglishGlossary() }
  } catch (error) {
    handleApiError(error, 'Failed to load the glossary')
  }
})
