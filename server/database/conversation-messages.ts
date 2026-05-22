import { getSql } from './db'

export type ConversationMessageDirection = 'inbound' | 'outbound'
export type ConversationMessageStatus = 'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'received' | 'held'

export interface ConversationMessage {
  id: number
  conversation_id: number
  direction: ConversationMessageDirection
  status: ConversationMessageStatus
  sender_user_id: string | null
  from_email: string | null
  from_name: string | null
  to_email: string | null
  subject: string | null
  body_html: string | null
  body_stripped_html: string | null
  body_text: string | null
  email_message_id: string | null
  in_reply_to: string | null
  email_references: string | null
  spam_score: string | number | null
  raw_s3_key: string | null
  authenticated: boolean
  auth_result: string | null
  hold_reason: string | null
  failed_reason: string | null
  provider_message_id: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}

class ConversationMessageService {
  private sql = getSql()

  async create(data: Partial<ConversationMessage> & {
    conversation_id: number
    direction: ConversationMessageDirection
  }): Promise<ConversationMessage> {
    const [row] = await this.sql`
      INSERT INTO conversation_messages (
        conversation_id, direction, status, sender_user_id, from_email, from_name, to_email, subject,
        body_html, body_stripped_html, body_text, email_message_id, in_reply_to, email_references,
        spam_score, raw_s3_key, authenticated, auth_result, hold_reason, failed_reason, provider_message_id
      )
      VALUES (
        ${data.conversation_id}, ${data.direction}, ${data.status || (data.direction === 'inbound' ? 'received' : 'queued')},
        ${data.sender_user_id || null}, ${data.from_email || null}, ${data.from_name || null}, ${data.to_email || null},
        ${data.subject || null}, ${data.body_html || null}, ${data.body_stripped_html || null}, ${data.body_text || null},
        ${data.email_message_id || null}, ${data.in_reply_to || null}, ${data.email_references || null},
        ${data.spam_score ?? null}, ${data.raw_s3_key || null}, ${data.authenticated ?? false}, ${data.auth_result || null},
        ${data.hold_reason || null}, ${data.failed_reason || null}, ${data.provider_message_id || null}
      )
      RETURNING *
    `
    return row as ConversationMessage
  }

  async getById(id: number): Promise<ConversationMessage | null> {
    const [row] = await this.sql`SELECT * FROM conversation_messages WHERE id = ${id}`
    return (row as ConversationMessage) || null
  }

  async listForConversation(conversationId: number): Promise<ConversationMessage[]> {
    return await this.sql`
      SELECT * FROM conversation_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
    ` as any
  }

  async findByEmailMessageId(emailMessageId: string): Promise<ConversationMessage | null> {
    const [row] = await this.sql`
      SELECT * FROM conversation_messages
      WHERE email_message_id = ${emailMessageId}
      LIMIT 1
    `
    return (row as ConversationMessage) || null
  }

  async findByProviderMessageId(providerMessageId: string): Promise<ConversationMessage | null> {
    const [row] = await this.sql`
      SELECT * FROM conversation_messages
      WHERE provider_message_id = ${providerMessageId}
      LIMIT 1
    `
    return (row as ConversationMessage) || null
  }

  async latestInbound(conversationId: number): Promise<ConversationMessage | null> {
    const [row] = await this.sql`
      SELECT * FROM conversation_messages
      WHERE conversation_id = ${conversationId} AND direction = 'inbound'
      ORDER BY created_at DESC
      LIMIT 1
    `
    return (row as ConversationMessage) || null
  }

  async saveDraft(data: Partial<ConversationMessage> & { conversation_id: number; sender_user_id: string }): Promise<ConversationMessage> {
    return this.create({ ...data, direction: 'outbound', status: 'draft' })
  }

  async listDrafts(conversationId: number): Promise<ConversationMessage[]> {
    return await this.sql`
      SELECT * FROM conversation_messages
      WHERE conversation_id = ${conversationId} AND status = 'draft'
      ORDER BY updated_at DESC
    ` as any
  }

  async markStatus(id: number, status: ConversationMessageStatus, updates: {
    provider_message_id?: string | null
    failed_reason?: string | null
    delivered_at?: Date | string | null
  } = {}): Promise<ConversationMessage | null> {
    const [row] = await this.sql`
      UPDATE conversation_messages
      SET status = ${status},
          provider_message_id = COALESCE(${updates.provider_message_id ?? null}, provider_message_id),
          failed_reason = ${updates.failed_reason ?? null},
          delivered_at = COALESCE(${updates.delivered_at ? new Date(updates.delivered_at).toISOString() : null}, delivered_at),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return (row as ConversationMessage) || null
  }

  async updateRawS3Key(id: number, rawS3Key: string | null): Promise<ConversationMessage | null> {
    const [row] = await this.sql`
      UPDATE conversation_messages
      SET raw_s3_key = ${rawS3Key}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return (row as ConversationMessage) || null
  }

  async listStorageKeysForSubscriber(subscriberId: number): Promise<Array<{ raw_s3_key: string | null; attachment_s3_key: string | null }>> {
    return await this.sql`
      SELECT m.raw_s3_key, a.s3_key AS attachment_s3_key
      FROM conversations c
      JOIN conversation_messages m ON m.conversation_id = c.id
      LEFT JOIN conversation_attachments a ON a.message_id = m.id
      WHERE c.subscriber_id = ${subscriberId}
    ` as any
  }
}

export const messageService = new ConversationMessageService()
