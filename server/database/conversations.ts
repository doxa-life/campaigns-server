import type { Fragment } from 'postgres'
import { randomBytes } from 'crypto'
import { getSql } from './db'
import { buildWhere } from './sql-helpers'

export type ConversationStatus = 'open' | 'pending' | 'closed' | 'spam'
export type MessageDirection = 'inbound' | 'outbound'

export interface Conversation {
  id: number
  subscriber_id: number | null
  channel: string
  subject: string | null
  status: ConversationStatus
  assigned_user_id: string | null
  reply_token: string
  needs_review: boolean
  tags: string[]
  last_message_at: string | null
  last_message_direction: MessageDirection | null
  created_at: string
  updated_at: string
}

export interface ConversationWithDetails extends Conversation {
  subscriber_name: string | null
  subscriber_email: string | null
  assignee_name: string | null
  message_count: number
  last_message_snippet: string | null
}

export interface ConversationListFilters {
  status?: ConversationStatus
  channel?: string
  assignedUserId?: string
  unassigned?: boolean
  mine?: string
  held?: boolean
  tag?: string
  search?: string
  limit?: number
  offset?: number
}

function generateReplyToken(): string {
  // 10 bytes (80-bit) hex — unguessable, and short enough that the signed reply
  // variant `contact+<token>.<exp>.<sig>@<domain>` stays within the 64-char local-part limit.
  return randomBytes(10).toString('hex')
}

class ConversationService {
  private sql = getSql()

  async create(data: {
    subscriber_id: number | null
    channel?: string
    subject?: string | null
    status?: ConversationStatus
    assigned_user_id?: string | null
    needs_review?: boolean
  }): Promise<Conversation> {
    const [row] = await this.sql<Conversation[]>`
      INSERT INTO conversations (
        subscriber_id, channel, subject, status, assigned_user_id, reply_token, needs_review
      ) VALUES (
        ${data.subscriber_id},
        ${data.channel || 'email'},
        ${data.subject ?? null},
        ${data.status || 'open'},
        ${data.assigned_user_id ?? null},
        ${generateReplyToken()},
        ${data.needs_review ?? false}
      )
      RETURNING *
    `
    return row!
  }

  async getById(id: number): Promise<Conversation | null> {
    const [row] = await this.sql<Conversation[]>`SELECT * FROM conversations WHERE id = ${id}`
    return row ?? null
  }

  async getByIdWithDetails(id: number): Promise<ConversationWithDetails | null> {
    const [row] = await this.sql`
      SELECT c.*,
        s.name AS subscriber_name,
        (SELECT cm.value FROM contact_methods cm
          WHERE cm.subscriber_id = c.subscriber_id AND cm.type = 'email'
          ORDER BY cm.verified DESC, cm.created_at ASC LIMIT 1) AS subscriber_email,
        u.display_name AS assignee_name,
        (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id AND m.status <> 'draft') AS message_count,
        NULL AS last_message_snippet
      FROM conversations c
      LEFT JOIN subscribers s ON s.id = c.subscriber_id
      LEFT JOIN users u ON u.id = c.assigned_user_id
      WHERE c.id = ${id}
    `
    if (!row) return null
    return { ...row, message_count: Number(row.message_count) } as ConversationWithDetails
  }

  async findByReplyToken(token: string): Promise<Conversation | null> {
    const [row] = await this.sql<Conversation[]>`SELECT * FROM conversations WHERE reply_token = ${token}`
    return row ?? null
  }

  // Most recent conversation for a subscriber (used to reuse a spam thread for repeat blocked senders).
  async getLatestForSubscriber(subscriberId: number): Promise<Conversation | null> {
    const [row] = await this.sql<Conversation[]>`
      SELECT * FROM conversations
      WHERE subscriber_id = ${subscriberId}
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `
    return row ?? null
  }

  private buildConditions(filters: ConversationListFilters): Fragment[] {
    const conditions: Fragment[] = []

    if (filters.status) conditions.push(this.sql`c.status = ${filters.status}`)
    if (filters.channel) conditions.push(this.sql`c.channel = ${filters.channel}`)
    if (filters.held) conditions.push(this.sql`c.needs_review = true`)
    if (filters.unassigned) conditions.push(this.sql`c.assigned_user_id IS NULL`)
    if (filters.mine) conditions.push(this.sql`c.assigned_user_id = ${filters.mine}`)
    if (filters.assignedUserId) conditions.push(this.sql`c.assigned_user_id = ${filters.assignedUserId}`)
    if (filters.tag) conditions.push(this.sql`c.tags @> ${this.sql.json([filters.tag])}`)

    if (filters.search) {
      const term = `%${filters.search}%`
      conditions.push(this.sql`(
        c.subject ILIKE ${term}
        OR s.name ILIKE ${term}
        OR EXISTS (
          SELECT 1 FROM contact_methods cm
          WHERE cm.subscriber_id = c.subscriber_id AND cm.value ILIKE ${term}
        )
      )`)
    }

    return conditions
  }

  async list(filters: ConversationListFilters = {}): Promise<ConversationWithDetails[]> {
    const whereClause = buildWhere(this.sql, this.buildConditions(filters))
    const limit = filters.limit ?? 100
    const offset = filters.offset ?? 0

    const rows = await this.sql`
      SELECT c.*,
        s.name AS subscriber_name,
        (SELECT cm.value FROM contact_methods cm
          WHERE cm.subscriber_id = c.subscriber_id AND cm.type = 'email'
          ORDER BY cm.verified DESC, cm.created_at ASC LIMIT 1) AS subscriber_email,
        u.display_name AS assignee_name,
        (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id AND m.status <> 'draft') AS message_count,
        (SELECT LEFT(COALESCE(m.body_text, regexp_replace(COALESCE(m.body_stripped_html, m.body_html, ''), '<[^>]*>', '', 'g')), 160)
          FROM conversation_messages m
          WHERE m.conversation_id = c.id AND m.status <> 'draft'
          ORDER BY m.created_at DESC LIMIT 1) AS last_message_snippet
      FROM conversations c
      LEFT JOIN subscribers s ON s.id = c.subscriber_id
      LEFT JOIN users u ON u.id = c.assigned_user_id
      ${whereClause}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    return rows.map((r: any) => ({ ...r, message_count: Number(r.message_count) })) as ConversationWithDetails[]
  }

  async count(filters: ConversationListFilters = {}): Promise<number> {
    const whereClause = buildWhere(this.sql, this.buildConditions(filters))
    const [row] = await this.sql<{ count: string }[]>`
      SELECT COUNT(*) AS count
      FROM conversations c
      LEFT JOIN subscribers s ON s.id = c.subscriber_id
      ${whereClause}
    `
    return Number(row?.count ?? 0)
  }

  // Rail badge counts (ignores search). The all/unassigned/mine tallies respect the status
  // filter so they match the visible list. `held` (needs-review) is status-independent — it's
  // an alarm for the whole review queue, surfaced regardless of which status tab is active.
  async counts(opts: {
    status?: ConversationStatus
    mine?: string
    scope?: 'all' | 'unassigned' | 'mine' | 'held'
  } = {}): Promise<{
    all: number
    unassigned: number
    mine: number
    held: number
    open: number
    pending: number
  }> {
    const statusCond = () => opts.status ? this.sql`c.status = ${opts.status}` : this.sql`TRUE`
    const mineId = opts.mine ?? null
    // Per-status counts (used for the status-strip badges) reflect the active
    // scope rail so the number matches what the list will show when that tab
    // is opened. They intentionally ignore the current status filter so each
    // badge stays meaningful when a different status tab is selected.
    const scopeCond = () => {
      if (opts.scope === 'unassigned') return this.sql`c.assigned_user_id IS NULL`
      if (opts.scope === 'mine') {
        // "Mine" with no user id is meaningless — return zero rather than
        // silently widening to the whole table.
        return mineId ? this.sql`c.assigned_user_id = ${mineId}` : this.sql`FALSE`
      }
      if (opts.scope === 'held') return this.sql`c.needs_review = true`
      return this.sql`TRUE`
    }
    const [row] = await this.sql<{
      all: string; unassigned: string; mine: string; held: string; open: string; pending: string
    }[]>`
      SELECT
        COUNT(*) FILTER (WHERE ${statusCond()}) AS all,
        COUNT(*) FILTER (WHERE ${statusCond()} AND c.assigned_user_id IS NULL) AS unassigned,
        COUNT(*) FILTER (WHERE ${statusCond()} AND c.assigned_user_id = ${mineId}) AS mine,
        COUNT(*) FILTER (WHERE c.needs_review = true) AS held,
        COUNT(*) FILTER (WHERE c.status = 'open' AND ${scopeCond()}) AS open,
        COUNT(*) FILTER (WHERE c.status = 'pending' AND ${scopeCond()}) AS pending
      FROM conversations c
    `
    return {
      all: Number(row?.all ?? 0),
      unassigned: Number(row?.unassigned ?? 0),
      mine: Number(row?.mine ?? 0),
      held: Number(row?.held ?? 0),
      open: Number(row?.open ?? 0),
      pending: Number(row?.pending ?? 0),
    }
  }

  async listForSubscriber(subscriberId: number): Promise<ConversationWithDetails[]> {
    const rows = await this.sql`
      SELECT c.*,
        s.name AS subscriber_name,
        (SELECT cm.value FROM contact_methods cm
          WHERE cm.subscriber_id = c.subscriber_id AND cm.type = 'email'
          ORDER BY cm.verified DESC, cm.created_at ASC LIMIT 1) AS subscriber_email,
        u.display_name AS assignee_name,
        (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id AND m.status <> 'draft') AS message_count,
        (SELECT LEFT(COALESCE(m.body_text, regexp_replace(COALESCE(m.body_stripped_html, m.body_html, ''), '<[^>]*>', '', 'g')), 160)
          FROM conversation_messages m
          WHERE m.conversation_id = c.id AND m.status <> 'draft'
          ORDER BY m.created_at DESC LIMIT 1) AS last_message_snippet
      FROM conversations c
      LEFT JOIN subscribers s ON s.id = c.subscriber_id
      LEFT JOIN users u ON u.id = c.assigned_user_id
      WHERE c.subscriber_id = ${subscriberId}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    `
    return rows.map((r: any) => ({ ...r, message_count: Number(r.message_count) })) as ConversationWithDetails[]
  }

  async updateStatus(id: number, status: ConversationStatus): Promise<Conversation | null> {
    const [row] = await this.sql<Conversation[]>`
      UPDATE conversations
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return row ?? null
  }

  async assign(id: number, userId: string | null): Promise<Conversation | null> {
    const [row] = await this.sql<Conversation[]>`
      UPDATE conversations
      SET assigned_user_id = ${userId}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return row ?? null
  }

  // Assign only if currently unassigned (used on agent reply / staff inbound). Returns true if it set the owner.
  async assignIfUnassigned(id: number, userId: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE conversations
      SET assigned_user_id = ${userId}, updated_at = NOW()
      WHERE id = ${id} AND assigned_user_id IS NULL
    `
    return result.count > 0
  }

  async setNeedsReview(id: number, value: boolean): Promise<void> {
    await this.sql`UPDATE conversations SET needs_review = ${value}, updated_at = NOW() WHERE id = ${id}`
  }

  // Replace a conversation's tag set with the given slugs (already validated/sanitised by the caller).
  async setTags(id: number, slugs: string[]): Promise<void> {
    await this.sql`UPDATE conversations SET tags = ${this.sql.json(slugs)}, updated_at = NOW() WHERE id = ${id}`
  }

  // Per-tag count of non-spam conversations, for the rail's clickable tag list. Each
  // tag acts as a cross-status folder, so spam is the only status excluded (it's noise).
  async tagCounts(): Promise<Record<string, number>> {
    const rows = await this.sql<{ slug: string; count: number }[]>`
      SELECT t.tag AS slug, COUNT(*)::int AS count
      FROM conversations c
      CROSS JOIN LATERAL jsonb_array_elements_text(c.tags) AS t(tag)
      WHERE c.status <> 'spam'
      GROUP BY t.tag
    `
    const out: Record<string, number> = {}
    for (const r of rows) out[r.slug] = Number(r.count)
    return out
  }

  async setSubject(id: number, subject: string): Promise<void> {
    await this.sql`
      UPDATE conversations
      SET subject = ${subject}, updated_at = NOW()
      WHERE id = ${id} AND (subject IS NULL OR subject = '')
    `
  }

  async touchLastMessage(id: number, at: string, direction: MessageDirection): Promise<void> {
    await this.sql`
      UPDATE conversations
      SET last_message_at = ${at}, last_message_direction = ${direction}, updated_at = NOW()
      WHERE id = ${id}
    `
  }

  // Auto-close all of a sender's conversations (used when marking spam / inbound from blocklisted sender)
  async closeForSubscriberAsSpam(subscriberId: number): Promise<number> {
    const result = await this.sql`
      UPDATE conversations
      SET status = 'spam', updated_at = NOW()
      WHERE subscriber_id = ${subscriberId} AND status <> 'spam'
    `
    return result.count
  }
}

export const conversationService = new ConversationService()
