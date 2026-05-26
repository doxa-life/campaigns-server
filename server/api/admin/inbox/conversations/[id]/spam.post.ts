import { conversationService } from '#server/database/conversations'
import { messageService } from '#server/database/conversation-messages'
import { spamSenderService } from '#server/database/spam-senders'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.view')
  const id = getIntParam(event, 'id')
  const body = await readBody<{ spam?: boolean }>(event)
  const spam = body.spam !== false

  try {
    const conversation = await conversationService.getById(id)
    if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    const messages = await messageService.listForConversation(id)
    const firstInbound = messages.find(m => m.direction === 'inbound' && m.from_email)

    if (firstInbound?.from_email) {
      if (spam) await spamSenderService.add(firstInbound.from_email, user.userId)
      else await spamSenderService.remove(firstInbound.from_email)
    }
    const updated = await conversationService.updateStatus(id, spam ? 'spam' : 'open')
    if (!spam) await conversationService.setNeedsReview(id, false)

    logUpdate('conversations', String(id), event, { spam })
    return { conversation: updated }
  } catch (error) {
    handleApiError(error, 'Failed to update spam state')
  }
})
