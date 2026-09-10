import { conversationService } from '#server/database/conversations'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'
import { requireInboxAccess, canAccessConversation } from '#server/utils/inbox-access'

export default defineEventHandler(async (event) => {
  const access = await requireInboxAccess(event, 'inbox.view')

  const subscriberId = getIntParam(event, 'id')

  try {
    const conversations = (await conversationService.listForSubscriber(subscriberId))
      .filter(c => canAccessConversation(access, c))
    return { conversations }
  } catch (error) {
    handleApiError(error, 'Failed to load conversations')
  }
})
