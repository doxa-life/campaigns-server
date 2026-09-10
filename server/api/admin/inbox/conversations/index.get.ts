import { conversationService, type ConversationStatus } from '#server/database/conversations'
import { handleApiError } from '#server/utils/api-helpers'
import { requireInboxAccess } from '#server/utils/inbox-access'

export default defineEventHandler(async (event) => {
  const access = await requireInboxAccess(event, 'inbox.view')

  const query = getQuery(event)
  const status = query.status as ConversationStatus | undefined
  const channel = query.channel as string | undefined
  const search = query.search as string | undefined
  const held = query.held === 'true' || query.held === '1'
  const unassigned = query.unassigned === 'true' || query.unassigned === '1'
  const mine = query.mine as string | undefined
  const assignedUserId = query.assigned_user_id as string | undefined
  const tag = query.tag as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : 100
  const offset = query.offset ? parseInt(query.offset as string) : 0

  // An assigned-only agent sees just their own conversations: that scope is applied on top of
  // whatever filters were sent, so a filter pointing elsewhere (unassigned, another assignee)
  // simply matches nothing.
  const filters = {
    status, channel, search, held, unassigned, assignedUserId, tag, limit, offset,
    mine: access.assignedOnly ? access.userId : mine,
  }

  try {
    const [conversations, total] = await Promise.all([
      conversationService.list(filters),
      conversationService.count(filters),
    ])
    return { conversations, total }
  } catch (error) {
    handleApiError(error, 'Failed to list conversations')
  }
})
