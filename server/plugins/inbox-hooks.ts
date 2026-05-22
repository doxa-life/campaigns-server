import { conversationService } from '../database/conversations'
import { messageService } from '../database/conversation-messages'
import { deleteInboxStorageKey } from '../utils/inbox-attachments'

export default defineNitroPlugin(() => {
  addAction('record.delete', async (recordType: string, recordId: number) => {
    if (recordType !== 'subscriber') return

    const storageKeys = await messageService.listStorageKeysForSubscriber(recordId)
    const uniqueKeys = new Set<string>()
    for (const row of storageKeys) {
      if (row.raw_s3_key) uniqueKeys.add(row.raw_s3_key)
      if (row.attachment_s3_key) uniqueKeys.add(row.attachment_s3_key)
    }
    for (const key of uniqueKeys) {
      await deleteInboxStorageKey(key)
    }

    const { items } = await conversationService.list({ subscriberId: recordId, limit: 100 })
    for (const conversation of items) {
      logDelete('conversations', String(conversation.id), undefined, {
        source: 'subscriber_delete',
        subscriber_id: recordId
      })
    }
  })
})
