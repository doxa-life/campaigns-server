import { getOwnedConversationOr404, listMessages } from '#server/database/context-assistant'
import { roleService } from '#server/database/roles'

/** GET /api/admin/context/assistant/conversations/:id — a chat and its messages. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.view')
  const conversation = await getOwnedConversationOr404(getRouterParam(event, 'id') ?? '', auth.userId)

  return {
    conversation,
    messages: await listMessages(conversation.id),
    can_apply: await roleService.userHasPermission(auth.userId, 'context.edit')
  }
})
