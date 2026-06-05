import { getSql } from './db'
import type { MessageDirection } from './conversations'

export type MessageStatus =
  | 'draft'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'received'
  | 'held'

// Reviewer-facing metadata attached to an AI-generated draft. Shown in the composer
// (gloss, sources, uncertainty) so a teammate can vet the draft before sending; never emailed.
export interface AiDraftMetadata {
  gloss: string
  language: string
  sources: string[]
  uncertainty: string[]
  model: string
}

export interface ConversationMessage {
  id: number
  conversation_id: number
  direction: MessageDirection
  status: MessageStatus
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
  spam_score: number | null
  raw_s3_key: string | null
  authenticated: boolean
  auth_result: string | null
  hold_reason: string | null
  failed_reason: string | null
  provider_message_id: string | null
  delivered_at: string | null
  ai_generated: boolean
  ai_metadata: AiDraftMetadata | null
  created_at: string
  updated_at: string
}

export interface CreateMessageData {
  conversation_id: number
  direction: MessageDirection
  status?: MessageStatus
  sender_user_id?: string | null
  from_email?: string | null
  from_name?: string | null
  to_email?: string | null
  subject?: string | null
  body_html?: string | null
  body_stripped_html?: string | null
  body_text?: string | null
  email_message_id?: string | null
  in_reply_to?: string | null
  email_references?: string | null
  spam_score?: number | null
  raw_s3_key?: string | null
  authenticated?: boolean
  auth_result?: string | null
  hold_reason?: string | null
  ai_generated?: boolean
  ai_metadata?: AiDraftMetadata | null
}

class MessageService {
  private sql = getSql()

  async create(data: CreateMessageData): Promise<ConversationMessage> {
    const [row] = await this.sql<ConversationMessage[]>`
      INSERT INTO conversation_messages (
        conversation_id, direction, status, sender_user_id,
        from_email, from_name, to_email, subject,
        body_html, body_stripped_html, body_text,
        email_message_id, in_reply_to, email_references,
        spam_score, raw_s3_key, authenticated, auth_result, hold_reason,
        ai_generated, ai_metadata
      ) VALUES (
        ${data.conversation_id}, ${data.direction}, ${data.status || 'received'}, ${data.sender_user_id ?? null},
        ${data.from_email ?? null}, ${data.from_name ?? null}, ${data.to_email ?? null}, ${data.subject ?? null},
        ${data.body_html ?? null}, ${data.body_stripped_html ?? null}, ${data.body_text ?? null},
        ${data.email_message_id ?? null}, ${data.in_reply_to ?? null}, ${data.email_references ?? null},
        ${data.spam_score ?? null}, ${data.raw_s3_key ?? null}, ${data.authenticated ?? false},
        ${data.auth_result ?? null}, ${data.hold_reason ?? null},
        ${data.ai_generated ?? false}, ${data.ai_metadata ? this.sql.json(data.ai_metadata as any) : null}
      )
      RETURNING *
    `
    return row!
  }

  async getById(id: number): Promise<ConversationMessage | null> {
    const [row] = await this.sql<ConversationMessage[]>`SELECT * FROM conversation_messages WHERE id = ${id}`
    return row ?? null
  }

  async findByEmailMessageId(messageId: string): Promise<ConversationMessage | null> {
    if (!messageId) return null
    const [row] = await this.sql<ConversationMessage[]>`
      SELECT * FROM conversation_messages WHERE email_message_id = ${messageId}
    `
    return row ?? null
  }

  // Find the conversation a referenced message belongs to (threading fallback when no token).
  // Matches either email_message_id or provider_message_id: a contact replying to a
  // staff-forwarded message references the provider's id, which we keep separate from
  // the row's email_message_id (that holds the inbound id for idempotency).
  async findConversationByMessageIds(messageIds: string[]): Promise<number | null> {
    const ids = messageIds.filter(Boolean)
    if (ids.length === 0) return null
    const [row] = await this.sql<{ conversation_id: number }[]>`
      SELECT conversation_id FROM conversation_messages
      WHERE email_message_id IN ${this.sql(ids)}
         OR provider_message_id IN ${this.sql(ids)}
      ORDER BY created_at DESC LIMIT 1
    `
    return row?.conversation_id ?? null
  }

  // Most recent inbound message — used to set In-Reply-To / References on outbound replies
  async getLastInbound(conversationId: number): Promise<ConversationMessage | null> {
    const [row] = await this.sql<ConversationMessage[]>`
      SELECT * FROM conversation_messages
      WHERE conversation_id = ${conversationId} AND direction = 'inbound'
      ORDER BY created_at DESC LIMIT 1
    `
    return row ?? null
  }

  // Messages for the thread view (excludes drafts). Includes the staff sender's name
  // (NULL for inbound messages) so the UI can show who sent each outbound reply.
  async listForConversation(conversationId: number): Promise<(ConversationMessage & { sender_name: string | null })[]> {
    return await this.sql`
      SELECT m.*, u.display_name AS sender_name
      FROM conversation_messages m
      LEFT JOIN users u ON u.id = m.sender_user_id
      WHERE m.conversation_id = ${conversationId} AND m.status <> 'draft'
      ORDER BY m.created_at ASC
    ` as any
  }

  async listDrafts(conversationId: number): Promise<ConversationMessage[]> {
    return await this.sql<ConversationMessage[]>`
      SELECT * FROM conversation_messages
      WHERE conversation_id = ${conversationId} AND status = 'draft'
      ORDER BY created_at ASC
    `
  }

  async updateDraft(id: number, data: { body_html?: string | null; body_text?: string | null; from_email?: string | null }): Promise<ConversationMessage | null> {
    const [row] = await this.sql<ConversationMessage[]>`
      UPDATE conversation_messages
      SET body_html = ${data.body_html ?? null},
          body_text = ${data.body_text ?? null},
          from_email = COALESCE(${data.from_email ?? null}, from_email),
          updated_at = NOW()
      WHERE id = ${id} AND status = 'draft'
      RETURNING *
    `
    return row ?? null
  }

  // Overwrite an existing draft with a freshly generated AI draft (regenerate reuses
  // the same row so we don't orphan drafts). Keeps it marked AI-generated.
  async updateAiDraft(
    id: number,
    data: { body_html: string; body_text: string; subject?: string | null; from_email?: string | null; ai_metadata: AiDraftMetadata }
  ): Promise<ConversationMessage | null> {
    const [row] = await this.sql<ConversationMessage[]>`
      UPDATE conversation_messages
      SET body_html = ${data.body_html},
          body_text = ${data.body_text},
          subject = COALESCE(${data.subject ?? null}, subject),
          from_email = COALESCE(${data.from_email ?? null}, from_email),
          ai_generated = true,
          ai_metadata = ${this.sql.json(data.ai_metadata as any)},
          updated_at = NOW()
      WHERE id = ${id} AND status = 'draft'
      RETURNING *
    `
    return row ?? null
  }

  async deleteDraft(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM conversation_messages WHERE id = ${id} AND status = 'draft'`
    return result.count > 0
  }

  // Mark an outbound message sent and store the provider's message-id, also as
  // email_message_id (when unset) so the contact's reply threads back to this message.
  async markSent(id: number, providerMessageId?: string): Promise<ConversationMessage | null> {
    const [row] = await this.sql<ConversationMessage[]>`
      UPDATE conversation_messages
      SET status = 'sent',
          provider_message_id = COALESCE(${providerMessageId ?? null}, provider_message_id),
          email_message_id = COALESCE(email_message_id, ${providerMessageId ?? null}),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return row ?? null
  }

  async markStatus(
    id: number,
    status: MessageStatus,
    extra: { provider_message_id?: string; failed_reason?: string; delivered_at?: string } = {}
  ): Promise<ConversationMessage | null> {
    const [row] = await this.sql<ConversationMessage[]>`
      UPDATE conversation_messages
      SET status = ${status},
          provider_message_id = COALESCE(${extra.provider_message_id ?? null}, provider_message_id),
          failed_reason = COALESCE(${extra.failed_reason ?? null}, failed_reason),
          delivered_at = COALESCE(${extra.delivered_at ?? null}, delivered_at),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return row ?? null
  }

  // Update delivery state by the provider's message-id (used by the delivery webhook).
  // Matches provider_message_id or email_message_id, ignoring angle brackets.
  async markDeliveryByProviderId(
    providerMessageId: string,
    status: 'delivered' | 'failed',
    extra: { failed_reason?: string; delivered_at?: string } = {}
  ): Promise<ConversationMessage | null> {
    const normalized = providerMessageId.replace(/^<|>$/g, '')
    const [row] = await this.sql<ConversationMessage[]>`
      UPDATE conversation_messages
      SET status = ${status},
          failed_reason = COALESCE(${extra.failed_reason ?? null}, failed_reason),
          delivered_at = COALESCE(${extra.delivered_at ?? null}, delivered_at),
          updated_at = NOW()
      WHERE direction = 'outbound'
        AND (
          replace(replace(provider_message_id, '<', ''), '>', '') = ${normalized}
          OR replace(replace(email_message_id, '<', ''), '>', '') = ${normalized}
        )
      RETURNING *
    `
    return row ?? null
  }
}

export const messageService = new MessageService()
