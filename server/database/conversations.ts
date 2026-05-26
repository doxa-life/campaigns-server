import { randomBytes } from 'crypto'
import { getSql } from './db'

export type ConversationStatus = 'open' | 'pending' | 'closed' | 'spam'
export type ConversationDirection = 'inbound' | 'outbound'

export interface Conversation {
  id: number
  subscriber_id: number | null
  channel: string
  subject: string | null
  status: ConversationStatus
  assigned_user_id: string | null
  reply_token: string
  needs_review: boolean
  last_message_at: string | null
  last_message_direction: ConversationDirection | null
  created_at: string
  updated_at: string
}

export interface ConversationListItem extends Conversation {
  subscriber_name: string | null
  subscriber_email: string | null
  assignee_name: string | null
  latest_body: string | null
  message_count: number
}

export interface ConversationFilters {
  status?: string
  assignee?: string
  unassigned?: boolean
  mine?: string
  held?: boolean
  search?: string
  subscriberId?: number
  limit?: number
  offset?: number
}

function makeReplyToken() {
  return randomBytes(18).toString('base64url')
}

class ConversationService {
  private sql = getSql()

  async create(data: {
    subscriber_id?: number | null
    channel?: string
    subject?: string | null
    status?: ConversationStatus
    assigned_user_id?: string | null
    reply_token?: string
    needs_review?: boolean
  }): Promise<Conversation> {
    const [row] = await this.sql`
      INSERT INTO conversations (
        subscriber_id, channel, subject, status, assigned_user_id, reply_token, needs_review,
        last_message_at, last_message_direction
      )
      VALUES (
        ${data.subscriber_id ?? null}, ${data.channel || 'email'}, ${data.subject || null},
        ${data.status || 'open'}, ${data.assigned_user_id || null}, ${data.reply_token || makeReplyToken()},
        ${data.needs_review ?? false}, NOW(), NULL
      )
      RETURNING *
    `
    return row as Conversation
  }

  async getById(id: number): Promise<ConversationListItem | null> {
    const [row] = await this.sql`
      SELECT c.*,
        s.name AS subscriber_name,
        cm.value AS subscriber_email,
        u.display_name AS assignee_name,
        latest.body_text AS latest_body,
        COUNT(m.id)::int AS message_count
      FROM conversations c
      LEFT JOIN subscribers s ON s.id = c.subscriber_id
      LEFT JOIN LATERAL (
        SELECT value FROM contact_methods
        WHERE subscriber_id = c.subscriber_id AND type = 'email'
        ORDER BY verified DESC, created_at ASC
        LIMIT 1
      ) cm ON true
      LEFT JOIN users u ON u.id = c.assigned_user_id
      LEFT JOIN LATERAL (
        SELECT body_text FROM conversation_messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN conversation_messages m ON m.conversation_id = c.id
      WHERE c.id = ${id}
      GROUP BY c.id, s.name, cm.value, u.display_name, latest.body_text
    `
    return (row as ConversationListItem) || null
  }

  async list(filters: ConversationFilters = {}): Promise<{ items: ConversationListItem[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100)
    const offset = filters.offset || 0
    const search = filters.search?.trim()

    const rows = await this.sql`
      SELECT c.*,
        s.name AS subscriber_name,
        cm.value AS subscriber_email,
        u.display_name AS assignee_name,
        latest.body_text AS latest_body,
        COUNT(m.id)::int AS message_count,
        COUNT(*) OVER()::int AS total_count
      FROM conversations c
      LEFT JOIN subscribers s ON s.id = c.subscriber_id
      LEFT JOIN LATERAL (
        SELECT value FROM contact_methods
        WHERE subscriber_id = c.subscriber_id AND type = 'email'
        ORDER BY verified DESC, created_at ASC
        LIMIT 1
      ) cm ON true
      LEFT JOIN users u ON u.id = c.assigned_user_id
      LEFT JOIN LATERAL (
        SELECT body_text FROM conversation_messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN conversation_messages m ON m.conversation_id = c.id
      WHERE (${filters.status || null}::text IS NULL OR c.status = ${filters.status || null})
        AND (${filters.assignee || null}::uuid IS NULL OR c.assigned_user_id = ${filters.assignee || null}::uuid)
        AND (${filters.unassigned || false} = false OR c.assigned_user_id IS NULL)
        AND (${filters.mine || null}::uuid IS NULL OR c.assigned_user_id = ${filters.mine || null}::uuid)
        AND (${filters.held || false} = false OR c.needs_review = true)
        AND (${filters.subscriberId || null}::int IS NULL OR c.subscriber_id = ${filters.subscriberId || null}::int)
        AND (
          ${search || null}::text IS NULL
          OR c.subject ILIKE '%' || ${search || null} || '%'
          OR s.name ILIKE '%' || ${search || null} || '%'
          OR cm.value ILIKE '%' || ${search || null} || '%'
          OR latest.body_text ILIKE '%' || ${search || null} || '%'
        )
      GROUP BY c.id, s.name, cm.value, u.display_name, latest.body_text
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return {
      items: rows as unknown as ConversationListItem[],
      total: Number(rows[0]?.total_count || 0)
    }
  }

  async updateStatus(id: number, status: ConversationStatus): Promise<Conversation | null> {
    const [row] = await this.sql`
      UPDATE conversations
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return (row as Conversation) || null
  }

  async assign(id: number, userId: string | null): Promise<Conversation | null> {
    const [row] = await this.sql`
      UPDATE conversations
      SET assigned_user_id = ${userId}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return (row as Conversation) || null
  }

  async setNeedsReview(id: number, needsReview: boolean): Promise<Conversation | null> {
    const [row] = await this.sql`
      UPDATE conversations
      SET needs_review = ${needsReview}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return (row as Conversation) || null
  }

  async findByReplyToken(token: string): Promise<Conversation | null> {
    const [row] = await this.sql`SELECT * FROM conversations WHERE reply_token = ${token}`
    return (row as Conversation) || null
  }

  async findByThreadHeader(messageIds: string[]): Promise<Conversation | null> {
    const ids = messageIds.filter(Boolean)
    if (ids.length === 0) return null
    const [row] = await this.sql`
      SELECT c.*
      FROM conversations c
      JOIN conversation_messages m ON m.conversation_id = c.id
      WHERE m.email_message_id = ANY(${ids})
      ORDER BY m.created_at DESC
      LIMIT 1
    `
    return (row as Conversation) || null
  }

  async findUserByEmailAlias(localPart: string, domain: string, expectedDomain: string): Promise<{ id: string; email: string; display_name: string; email_alias: string | null; email_signature: string | null } | null> {
    if (domain.toLowerCase() !== expectedDomain.toLowerCase()) return null
    const [row] = await this.sql`
      SELECT id, email, display_name, email_alias, email_signature
      FROM users
      WHERE LOWER(email_alias) = LOWER(${localPart})
      LIMIT 1
    `
    return (row as any) || null
  }

  async touchLastMessage(id: number, direction: ConversationDirection, status?: ConversationStatus): Promise<void> {
    await this.sql`
      UPDATE conversations
      SET last_message_at = NOW(),
          last_message_direction = ${direction},
          status = COALESCE(${status || null}, status),
          updated_at = NOW()
      WHERE id = ${id}
    `
  }
}

export const conversationService = new ConversationService()
