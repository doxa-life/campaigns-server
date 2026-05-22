import { conversationService } from '../database/conversations'
import { conversationAttachmentService } from '../database/conversation-attachments'
import { commentService } from '../database/comments'

/**
 * When a subscriber is deleted, their conversations/messages/attachments cascade via FK.
 * This hook handles what FKs can't: S3 objects (attachments + raw MIME) and the
 * polymorphic internal-note comments keyed by record_type='conversation'.
 * Fires before the subscriber row is deleted (see hooks docs in CLAUDE.md).
 */
export default defineNitroPlugin(() => {
  addAction('record.delete', async (recordType: string, recordId: number) => {
    if (recordType !== 'subscriber') return

    // Delete S3 objects for all the subscriber's conversation messages
    try {
      const keys = await conversationAttachmentService.getS3KeysForSubscriber(recordId)
      for (const key of keys) {
        try {
          await deleteFromS3(key)
        } catch (err: any) {
          console.error('[InboxHooks] Failed to delete S3 object:', key, err?.message || err)
        }
      }
    } catch (err: any) {
      console.error('[InboxHooks] Failed to gather S3 keys:', err?.message || err)
    }

    // Delete internal-note comments attached to each conversation (comments has no FK)
    try {
      const conversations = await conversationService.listForSubscriber(recordId)
      for (const c of conversations) {
        await commentService.deleteForRecord('conversation', c.id)
      }
    } catch (err: any) {
      console.error('[InboxHooks] Failed to delete conversation comments:', err?.message || err)
    }
  })
})
