import { messageService } from '#server/database/conversation-messages'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'
import { requireInboxAccess, requireAccessibleConversation } from '#server/utils/inbox-access'

export default defineEventHandler(async (event) => {
  const access = await requireInboxAccess(event, 'inbox.view')

  const id = getIntParam(event, 'id')
  await requireAccessibleConversation(access, id)

  try {
    const [messages, drafts] = await Promise.all([
      messageService.listForConversation(id),
      messageService.listDrafts(id),
    ])
    return { messages, drafts }
  } catch (error) {
    handleApiError(error, 'Failed to load messages')
  }
})
