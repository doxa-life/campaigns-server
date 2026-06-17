import { conversationService } from '#server/database/conversations'
import { inboxTagService } from '#server/database/inbox-tags'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

// Replace the tag set on a conversation. Tagging is a triage action, so it needs
// only inbox.view (like assign / status). Unknown slugs are dropped.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const id = getIntParam(event, 'id')
  const existing = await conversationService.getById(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const body = await readBody<{ tags?: string[] }>(event)

  try {
    const slugs = await inboxTagService.sanitizeSlugs(body.tags)
    await conversationService.setTags(id, slugs)
    logUpdate('conversations', String(id), event, { message: 'Tags updated', tags: slugs })

    const conversation = await conversationService.getByIdWithDetails(id)
    return { conversation }
  } catch (error) {
    handleApiError(error, 'Failed to update tags')
  }
})
