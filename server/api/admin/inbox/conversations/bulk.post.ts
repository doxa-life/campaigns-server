import { conversationService, type ConversationStatus } from '#server/database/conversations'
import { inboxTagService } from '#server/database/inbox-tags'
import { roleService } from '#server/database/roles'
import { handleApiError } from '#server/utils/api-helpers'

// Spam is excluded: marking spam blocklists the sender globally, so it stays a
// deliberate per-conversation action.
const VALID_STATUSES: ConversationStatus[] = ['open', 'pending', 'closed']
const MAX_IDS = 100

/**
 * Apply triage actions (status / assignee / add tags) to a set of conversations.
 * Body: { ids: number[], status?, assigned_user_id?, add_tags? }
 * Ids that don't exist are skipped; returns the count of conversations updated.
 */
export default defineEventHandler(async (event) => {
  // Triage actions require only inbox.view, like the single-conversation endpoints.
  await requirePermission(event, 'inbox.view')

  const body = await readBody<{
    ids?: unknown
    status?: ConversationStatus
    assigned_user_id?: string | null
    add_tags?: string[]
  }>(event)

  const ids = Array.isArray(body.ids)
    ? ([...new Set(body.ids.filter(v => Number.isInteger(v) && v > 0))] as number[])
    : []
  if (ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'ids is required' })
  }
  if (ids.length > MAX_IDS) {
    throw createError({ statusCode: 400, statusMessage: `At most ${MAX_IDS} ids per request` })
  }
  if (body.status === undefined && body.assigned_user_id === undefined && body.add_tags === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'No action given' })
  }

  try {
    const updated = new Set<number>()

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
      }
      const changed = await conversationService.bulkUpdateStatus(ids, body.status)
      // Closing resolves any pending review.
      if (body.status === 'closed') {
        await conversationService.bulkClearNeedsReview(changed)
      }
      for (const id of changed) {
        logUpdate('conversations', String(id), event, { message: `Status → ${body.status}`, status: body.status })
        updated.add(id)
      }
    }

    if (body.assigned_user_id !== undefined) {
      // Only users who can read the inbox may be set as the assignee.
      if (body.assigned_user_id !== null) {
        const assigneeCanRead = await roleService.userHasPermission(body.assigned_user_id, 'inbox.view')
        if (!assigneeCanRead) {
          throw createError({ statusCode: 400, statusMessage: 'Assignee lacks inbox access' })
        }
      }
      const changed = await conversationService.bulkAssign(ids, body.assigned_user_id)
      for (const id of changed) {
        logUpdate('conversations', String(id), event, {
          message: body.assigned_user_id ? 'Assigned' : 'Unassigned',
          assigned_user_id: body.assigned_user_id,
        })
        updated.add(id)
      }
    }

    if (body.add_tags !== undefined) {
      const slugs = await inboxTagService.sanitizeSlugs(body.add_tags)
      if (slugs.length > 0) {
        const changed = await conversationService.bulkAddTags(ids, slugs)
        for (const id of changed) {
          logUpdate('conversations', String(id), event, { message: 'Tags added', tags: slugs })
          updated.add(id)
        }
      }
    }

    return { updated: updated.size }
  } catch (error) {
    handleApiError(error, 'Failed to apply bulk update')
  }
})
