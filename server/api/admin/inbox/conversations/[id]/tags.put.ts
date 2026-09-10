import { conversationService } from '#server/database/conversations'
import { inboxTagService } from '#server/database/inbox-tags'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'
import { requireInboxAccess, requireAccessibleConversation } from '#server/utils/inbox-access'

// Replace the tag set on a conversation. Tagging is a triage action, so it needs
// only inbox.view (like assign / status). Unknown slugs are dropped.
export default defineEventHandler(async (event) => {
  const access = await requireInboxAccess(event, 'inbox.view')

  const id = getIntParam(event, 'id')
  await requireAccessibleConversation(access, id)

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
