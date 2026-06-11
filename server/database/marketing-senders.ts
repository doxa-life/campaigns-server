import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'

export interface MarketingSender {
  id: number
  name: string
  local_part: string
  reply_to: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateMarketingSenderData {
  name: string
  local_part: string
  reply_to?: string | null
  created_by: string
}

export interface UpdateMarketingSenderData {
  name?: string
  local_part?: string
  reply_to?: string | null
}

// Local part only — the domain (MARKETING_MAILGUN_DOMAIN) is appended at send time.
const LOCAL_PART_RE = /^[a-zA-Z0-9._%+-]+$/

// Full address for reply_to, which is emitted verbatim as the Reply-To header.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class MarketingSenderService {
  private sql = getSql()

  validateLocalPart(localPart: string): void {
    if (!localPart || !LOCAL_PART_RE.test(localPart)) {
      throw new Error('Invalid local part. Use letters, numbers, and . _ % + - only (no @ or spaces).')
    }
  }

  // reply_to is optional; only validate when a non-empty address is provided.
  validateReplyTo(replyTo: string): void {
    if (!EMAIL_RE.test(replyTo)) {
      throw new Error('Invalid reply-to address. Enter a valid email like name@example.com.')
    }
  }

  async list(includeInactive = false): Promise<MarketingSender[]> {
    if (includeInactive) {
      return await this.sql`SELECT * FROM marketing_senders ORDER BY name ASC` as unknown as MarketingSender[]
    }
    return await this.sql`
      SELECT * FROM marketing_senders WHERE active = true ORDER BY name ASC
    ` as unknown as MarketingSender[]
  }

  async getById(id: number): Promise<MarketingSender | null> {
    const [row] = await this.sql`SELECT * FROM marketing_senders WHERE id = ${id}`
    return (row as MarketingSender) || null
  }

  async create(data: CreateMarketingSenderData): Promise<MarketingSender> {
    this.validateLocalPart(data.local_part)
    if (data.reply_to) this.validateReplyTo(data.reply_to)

    const [row] = await this.sql`
      INSERT INTO marketing_senders (name, local_part, reply_to, created_by)
      VALUES (${data.name}, ${data.local_part}, ${data.reply_to ?? null}, ${data.created_by})
      RETURNING *
    `
    return row as MarketingSender
  }

  async update(id: number, data: UpdateMarketingSenderData): Promise<MarketingSender | null> {
    if (data.local_part !== undefined) this.validateLocalPart(data.local_part)
    if (data.reply_to) this.validateReplyTo(data.reply_to)

    const fields: Fragment[] = []
    if (data.name !== undefined) fields.push(this.sql`name = ${data.name}`)
    if (data.local_part !== undefined) fields.push(this.sql`local_part = ${data.local_part}`)
    if (data.reply_to !== undefined) fields.push(this.sql`reply_to = ${data.reply_to}`)

    if (fields.length === 0) return this.getById(id)

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    const [row] = await this.sql`
      UPDATE marketing_senders SET ${buildSet(this.sql, fields)} WHERE id = ${id} RETURNING *
    `
    return (row as MarketingSender) || null
  }

  // Soft delete: keep the row so sent emails' sender_id references stay intact.
  async deactivate(id: number): Promise<boolean> {
    const result = await this.sql`
      UPDATE marketing_senders
      SET active = false, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
    return result.count > 0
  }
}

export const marketingSenderService = new MarketingSenderService()
