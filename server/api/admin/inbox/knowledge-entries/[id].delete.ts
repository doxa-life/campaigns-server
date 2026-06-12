import { inboxKnowledgeService } from '#server/database/inbox-knowledge'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Delete a knowledge-base entry (requires inbox.send).
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  try {
    const ok = await inboxKnowledgeService.delete(id)
    if (!ok) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
    logDelete('inbox_knowledge_entries', String(id), event, { message: 'Knowledge entry deleted' })
    return { ok: true }
  } catch (error) {
    handleApiError(error, 'Failed to delete knowledge entry')
  }
})
