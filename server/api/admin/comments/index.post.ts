import { commentService } from '#server/database/comments'
import { sanitizeTiptapContent } from '#server/utils/sanitize-tiptap'
import { extractMentions } from '#server/utils/extract-mentions'
import { sendCommentMentionEmails } from '#server/utils/comment-mention-email'
import { handleApiError } from '#server/utils/api-helpers'

const RECORD_TYPE_PERMISSIONS: Record<string, string> = {
  people_group: 'people_groups.view',
  group: 'groups.view',
  subscriber: 'subscribers.view',
  people_group_report: 'people_groups.view'
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    record_type: string
    record_id: number
    content: Record<string, any>
  }>(event)

  if (!body.record_type || !body.record_id || !body.content) {
    throw createError({ statusCode: 400, statusMessage: 'record_type, record_id, and content are required' })
  }

  const permission = RECORD_TYPE_PERMISSIONS[body.record_type]
  if (!permission) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid record type' })
  }

  const user = await requirePermission(event, permission)

  const sanitized = sanitizeTiptapContent(body.content)
  if (!sanitized) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid content' })
  }

  try {
    const comment = await commentService.create({
      record_type: body.record_type,
      record_id: body.record_id,
      user_id: user.userId,
      content: sanitized
    })

    // Send mention notifications in the background
    const mentionedUserIds = extractMentions(sanitized)
    // Don't notify the author about their own mention
    const filteredMentions = mentionedUserIds.filter(id => id !== user.userId)
    if (filteredMentions.length > 0) {
      sendCommentMentionEmails(
        filteredMentions,
        user.display_name || user.email,
        body.record_type,
        body.record_id,
        `#${body.record_id}`,
        sanitized
      ).catch(err => console.error('Failed to send mention emails:', err))
    }

    return { comment }
  } catch (error) {
    handleApiError(error, 'Failed to create comment')
  }
})
