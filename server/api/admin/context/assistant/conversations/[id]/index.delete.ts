import { deleteConversation } from '#server/database/context-assistant'

/** DELETE /api/admin/context/assistant/conversations/:id */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'context.view')
  const deleted = await deleteConversation(getRouterParam(event, 'id') ?? '', auth.userId)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  return { success: true }
})
