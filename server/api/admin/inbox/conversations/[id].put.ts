import { conversationService, type ConversationStatus } from '#server/database/conversations'
import { roleService } from '#server/database/roles'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

const VALID_STATUSES: ConversationStatus[] = ['open', 'pending', 'closed', 'spam']

export default defineEventHandler(async (event) => {
  // Triage actions (assign / status) require only inbox.view
  const user = await requirePermission(event, 'inbox.view')

  const id = getIntParam(event, 'id')
  const existing = await conversationService.getById(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const body = await readBody<{
    status?: ConversationStatus
    assigned_user_id?: string | null
    needs_review?: boolean
  }>(event)

  try {
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
      }
      await conversationService.updateStatus(id, body.status)
      // Closing resolves any pending review.
      if (body.status === 'closed') {
        await conversationService.setNeedsReview(id, false)
      }
      logUpdate('conversations', String(id), event, { message: `Status → ${body.status}`, status: body.status })
    }

    if (body.assigned_user_id !== undefined) {
      // Only users who can read the inbox may be set as the assignee.
      if (body.assigned_user_id !== null) {
        const assigneeCanRead = await roleService.userHasPermission(body.assigned_user_id, 'inbox.view')
        if (!assigneeCanRead) {
          throw createError({ statusCode: 400, statusMessage: 'Assignee lacks inbox access' })
        }
      }
      await conversationService.assign(id, body.assigned_user_id)
      logUpdate('conversations', String(id), event, {
        message: body.assigned_user_id ? 'Assigned' : 'Unassigned',
        assigned_user_id: body.assigned_user_id,
      })
    }

    if (body.needs_review !== undefined) {
      await conversationService.setNeedsReview(id, body.needs_review)
    }

    const conversation = await conversationService.getByIdWithDetails(id)
    return { conversation }
  } catch (error) {
    handleApiError(error, 'Failed to update conversation')
  }
})
