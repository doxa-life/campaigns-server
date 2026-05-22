import { conversationService, type ConversationStatus } from '#server/database/conversations'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const query = getQuery(event)
  const status = query.status as ConversationStatus | undefined
  const mine = query.mine as string | undefined

  try {
    return await conversationService.counts({ status, mine })
  } catch (error) {
    handleApiError(error, 'Failed to count conversations')
  }
})
