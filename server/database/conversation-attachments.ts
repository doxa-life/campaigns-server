import { getSql } from './db'

export interface ConversationAttachment {
  id: number
  message_id: number
  s3_key: string
  filename: string | null
  content_type: string | null
  size_bytes: number | null
  created_at: string
}

class ConversationAttachmentService {
  private sql = getSql()

  async create(data: {
    message_id: number
    s3_key: string
    filename?: string | null
    content_type?: string | null
    size_bytes?: number | null
  }): Promise<ConversationAttachment> {
    const [row] = await this.sql<ConversationAttachment[]>`
      INSERT INTO conversation_attachments (message_id, s3_key, filename, content_type, size_bytes)
      VALUES (${data.message_id}, ${data.s3_key}, ${data.filename ?? null}, ${data.content_type ?? null}, ${data.size_bytes ?? null})
      RETURNING *
    `
    return row!
  }

  async listForMessage(messageId: number): Promise<ConversationAttachment[]> {
    return await this.sql<ConversationAttachment[]>`
      SELECT * FROM conversation_attachments WHERE message_id = ${messageId} ORDER BY id ASC
    `
  }

  async listForConversation(conversationId: number): Promise<(ConversationAttachment & { message_id: number })[]> {
    return await this.sql`
      SELECT a.* FROM conversation_attachments a
      JOIN conversation_messages m ON m.id = a.message_id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY a.id ASC
    ` as any
  }

  // All S3 keys (attachments + raw MIME) for a subscriber's conversations — used by the cascade cleanup hook
  async getS3KeysForSubscriber(subscriberId: number): Promise<string[]> {
    const attachmentKeys = await this.sql<{ s3_key: string }[]>`
      SELECT a.s3_key FROM conversation_attachments a
      JOIN conversation_messages m ON m.id = a.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.subscriber_id = ${subscriberId} AND a.s3_key IS NOT NULL
    `
    const rawKeys = await this.sql<{ raw_s3_key: string }[]>`
      SELECT m.raw_s3_key FROM conversation_messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.subscriber_id = ${subscriberId} AND m.raw_s3_key IS NOT NULL
    `
    return [...attachmentKeys.map(r => r.s3_key), ...rawKeys.map(r => r.raw_s3_key)]
  }
}

export const conversationAttachmentService = new ConversationAttachmentService()
