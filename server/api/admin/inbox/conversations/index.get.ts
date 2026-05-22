import { conversationService } from '#server/database/conversations'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.view')
  const query = getQuery(event)

  try {
    return await conversationService.list({
      status: query.status as string | undefined,
      assignee: query.assignee as string | undefined,
      unassigned: query.unassigned === 'true',
      mine: query.mine === 'true' ? user.userId : undefined,
      held: query.held === 'true',
      search: query.search as string | undefined,
      subscriberId: query.subscriber_id ? Number(query.subscriber_id) : undefined,
      limit: query.limit ? Number(query.limit) : 50,
      offset: query.offset ? Number(query.offset) : 0
    })
  } catch (error) {
    handleApiError(error, 'Failed to list conversations')
  }
})
