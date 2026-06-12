import { inboxKnowledgeService, type KnowledgeEntryStatus } from '#server/database/inbox-knowledge'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * List knowledge-base entries (requires inbox.view). Optional ?status=active|archived.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')
  try {
    const query = getQuery(event)
    const status = query.status as KnowledgeEntryStatus | undefined
    const entries = await inboxKnowledgeService.list(
      status === 'active' || status === 'archived' ? { status } : {}
    )
    return { entries }
  } catch (error) {
    handleApiError(error, 'Failed to list knowledge entries')
  }
})
