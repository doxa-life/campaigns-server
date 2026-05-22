import { conversationService } from '#server/database/conversations'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const subscriberId = getIntParam(event, 'id')

  try {
    const conversations = await conversationService.listForSubscriber(subscriberId)
    return { conversations }
  } catch (error) {
    handleApiError(error, 'Failed to load conversations')
  }
})
