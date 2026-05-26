import { conversationService } from '#server/database/conversations'
import { contactMethodService } from '#server/database/contact-methods'
import { spamSenderService } from '#server/database/spam-senders'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Mark a conversation's sender as spam (blocklists the address, sets Spam, auto-closes their
 * conversations) or un-spam (removes from blocklist, reopens). This globally blocklists a
 * sender and auto-closes their threads, so it requires inbox.send (not just view).
 * Body: { spam: boolean }
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.send')

  const id = getIntParam(event, 'id')
  const conversation = await conversationService.getById(id)
  if (!conversation) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const body = await readBody<{ spam?: boolean }>(event)
  const markSpam = body.spam !== false // default true

  const senderEmail = conversation.subscriber_id
    ? (await contactMethodService.getPrimaryEmail(conversation.subscriber_id))?.value || null
    : null

  try {
    if (markSpam) {
      if (senderEmail) {
        await spamSenderService.add(senderEmail, user.userId)
        if (conversation.subscriber_id) {
          await conversationService.closeForSubscriberAsSpam(conversation.subscriber_id)
        }
      } else {
        await conversationService.updateStatus(id, 'spam')
      }
      logUpdate('conversations', String(id), event, { message: 'Marked as spam', spam: true, sender: senderEmail })
    } else {
      if (senderEmail) await spamSenderService.remove(senderEmail)
      await conversationService.updateStatus(id, 'open')
      await conversationService.setNeedsReview(id, false)
      logUpdate('conversations', String(id), event, { message: 'Unmarked as spam', spam: false, sender: senderEmail })
    }

    const updated = await conversationService.getByIdWithDetails(id)
    return { conversation: updated }
  } catch (error) {
    handleApiError(error, 'Failed to update spam status')
  }
})
