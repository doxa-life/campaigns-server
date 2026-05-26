import { getSql } from './db'

export interface ConversationAttachment {
  id: number
  message_id: number
  s3_key: string | null
  filename: string | null
  content_type: string | null
  size_bytes: number | null
  created_at: string
  url?: string | null
}

class ConversationAttachmentService {
  private sql = getSql()

  async create(data: {
    message_id: number
    s3_key?: string | null
    filename?: string | null
    content_type?: string | null
    size_bytes?: number | null
  }): Promise<ConversationAttachment> {
    const [row] = await this.sql`
      INSERT INTO conversation_attachments (message_id, s3_key, filename, content_type, size_bytes)
      VALUES (${data.message_id}, ${data.s3_key || null}, ${data.filename || null}, ${data.content_type || null}, ${data.size_bytes || null})
      RETURNING *
    `
    return row as ConversationAttachment
  }

  async listForMessage(messageId: number): Promise<ConversationAttachment[]> {
    return await this.sql`
      SELECT * FROM conversation_attachments
      WHERE message_id = ${messageId}
      ORDER BY created_at ASC
    ` as any
  }

  async listForConversation(conversationId: number): Promise<ConversationAttachment[]> {
    return await this.sql`
      SELECT a.*
      FROM conversation_attachments a
      JOIN conversation_messages m ON m.id = a.message_id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY a.created_at ASC
    ` as any
  }

  async getById(id: number): Promise<ConversationAttachment | null> {
    const [row] = await this.sql`SELECT * FROM conversation_attachments WHERE id = ${id}`
    return (row as ConversationAttachment) || null
  }
}

export const attachmentService = new ConversationAttachmentService()
