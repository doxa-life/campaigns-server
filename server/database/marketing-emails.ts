import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet, buildWhere } from './sql-helpers'
import { roleService } from './roles'
import { peopleGroupAccessService } from './people-group-access'

export interface MarketingEmail {
  id: number
  subject: string
  content_json: Record<string, any>
  audience_type: 'doxa' | 'people_group'
  people_group_id: number | null
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'failed'
  created_by: string
  updated_by: string | null
  sent_by: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
}

export interface MarketingEmailWithPeopleGroup extends MarketingEmail {
  people_group_name?: string
  people_group_slug?: string
  created_by_name?: string
  created_by_email?: string
  updated_by_name?: string
  updated_by_email?: string
  sent_by_name?: string
  sent_by_email?: string
}

export interface CreateMarketingEmailData {
  subject: string
  content_json: Record<string, any>
  audience_type: 'doxa' | 'people_group'
  people_group_id?: number | null
  created_by: string
}

export interface UpdateMarketingEmailData {
  subject?: string
  content_json?: Record<string, any>
  audience_type?: 'doxa' | 'people_group'
  people_group_id?: number | null
  updated_by: string
}

export interface MarketingEmailFilters {
  status?: 'draft' | 'queued' | 'sending' | 'sent' | 'failed'
  audience_type?: 'doxa' | 'people_group'
  people_group_id?: number
}

class MarketingEmailService {
  private sql = getSql()

  async create(data: CreateMarketingEmailData): Promise<MarketingEmail> {
    const { subject, content_json, audience_type, people_group_id, created_by } = data

    if (audience_type === 'people_group' && !people_group_id) {
      throw new Error('people_group_id is required when audience_type is people_group')
    }
    if (audience_type === 'doxa' && people_group_id) {
      throw new Error('people_group_id should not be provided when audience_type is doxa')
    }

    const [row] = await this.sql`
      INSERT INTO marketing_emails (subject, content_json, audience_type, people_group_id, created_by)
      VALUES (${subject}, ${content_json}, ${audience_type},
              ${audience_type === 'people_group' ? people_group_id! : null}, ${created_by})
      RETURNING *
    `
    return row
  }

  async getById(id: number): Promise<MarketingEmail | null> {
    const [row] = await this.sql`SELECT * FROM marketing_emails WHERE id = ${id}`
    return row || null
  }

  async getByIdWithPeopleGroup(id: number): Promise<MarketingEmailWithPeopleGroup | null> {
    const [row] = await this.sql`
      SELECT me.*, pg.name as people_group_name, pg.slug as people_group_slug
      FROM marketing_emails me
      LEFT JOIN people_groups pg ON me.people_group_id = pg.id
      WHERE me.id = ${id}
    `
    return row || null
  }

  async update(id: number, data: UpdateMarketingEmailData): Promise<MarketingEmail | null> {
    const email = await this.getById(id)
    if (!email) return null

    if (email.status !== 'draft') throw new Error('Only drafts can be edited')

    const fields: Fragment[] = []

    if (data.subject !== undefined) fields.push(this.sql`subject = ${data.subject}`)
    if (data.content_json !== undefined) fields.push(this.sql`content_json = ${data.content_json}`)
    if (data.audience_type !== undefined) fields.push(this.sql`audience_type = ${data.audience_type}`)
    if (data.people_group_id !== undefined) fields.push(this.sql`people_group_id = ${data.people_group_id}`)
    if (data.updated_by) fields.push(this.sql`updated_by = ${data.updated_by}`)

    if (fields.length === 0) return email

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE marketing_emails SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    const email = await this.getById(id)
    if (!email) return false

    if (email.status !== 'draft') throw new Error('Only drafts can be deleted')

    const result = await this.sql`DELETE FROM marketing_emails WHERE id = ${id}`
    return result.count > 0
  }

  async listForUser(userId: string, filters?: MarketingEmailFilters): Promise<MarketingEmailWithPeopleGroup[]> {
    const isAdmin = await roleService.isAdmin(userId)

    const conditions: Fragment[] = []

    if (!isAdmin) {
      const peopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(userId)
      if (peopleGroupIds.length === 0) {
        conditions.push(this.sql`(me.audience_type = 'people_group' AND me.created_by = ${userId})`)
      } else {
        conditions.push(this.sql`(
          (me.audience_type = 'people_group' AND me.people_group_id IN ${this.sql(peopleGroupIds)})
          OR me.created_by = ${userId}
        )`)
      }
    }

    if (filters?.status) conditions.push(this.sql`me.status = ${filters.status}`)
    if (filters?.audience_type) conditions.push(this.sql`me.audience_type = ${filters.audience_type}`)
    if (filters?.people_group_id) conditions.push(this.sql`me.people_group_id = ${filters.people_group_id}`)

    const whereClause = conditions.length > 0 ? buildWhere(this.sql, conditions) : this.sql``

    return await this.sql`
      SELECT me.*,
        pg.name as people_group_name, pg.slug as people_group_slug,
        u_created.display_name as created_by_name, u_created.email as created_by_email,
        u_updated.display_name as updated_by_name, u_updated.email as updated_by_email,
        u_sent.display_name as sent_by_name, u_sent.email as sent_by_email
      FROM marketing_emails me
      LEFT JOIN people_groups pg ON me.people_group_id = pg.id
      LEFT JOIN users u_created ON me.created_by = u_created.id
      LEFT JOIN users u_updated ON me.updated_by = u_updated.id
      LEFT JOIN users u_sent ON me.sent_by = u_sent.id
      ${whereClause}
      ORDER BY me.updated_at DESC
    `
  }

  async updateStatus(id: number, status: MarketingEmail['status'], sentBy?: string): Promise<void> {
    if (status === 'queued' && sentBy) {
      if (status === 'sent' || status === 'failed') {
        await this.sql`
          UPDATE marketing_emails
          SET status = ${status}, sent_by = ${sentBy}, sent_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
              updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          WHERE id = ${id}
        `
      } else {
        await this.sql`
          UPDATE marketing_emails
          SET status = ${status}, sent_by = ${sentBy}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          WHERE id = ${id}
        `
      }
    } else if (status === 'sent' || status === 'failed') {
      await this.sql`
        UPDATE marketing_emails
        SET status = ${status}, sent_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
            updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ${id}
      `
    } else {
      await this.sql`
        UPDATE marketing_emails
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = ${id}
      `
    }
  }

  async updateStats(id: number, recipientCount: number, sentCount: number, failedCount: number): Promise<void> {
    await this.sql`
      UPDATE marketing_emails
      SET recipient_count = ${recipientCount}, sent_count = ${sentCount}, failed_count = ${failedCount},
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
  }

  async incrementSentCount(id: number): Promise<void> {
    await this.sql`
      UPDATE marketing_emails
      SET sent_count = sent_count + 1, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
  }

  async incrementFailedCount(id: number): Promise<void> {
    await this.sql`
      UPDATE marketing_emails
      SET failed_count = failed_count + 1, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
  }

  async canUserAccessEmail(userId: string, emailId: number): Promise<boolean> {
    const email = await this.getById(emailId)
    if (!email) return false

    const isAdmin = await roleService.isAdmin(userId)
    if (isAdmin) return true

    if (email.audience_type === 'doxa') return email.created_by === userId

    if (email.audience_type === 'people_group' && email.people_group_id) {
      return await peopleGroupAccessService.userHasAccess(userId, email.people_group_id)
    }

    return email.created_by === userId
  }

  async canUserSendToAudience(userId: string, audienceType: 'doxa' | 'people_group', peopleGroupId?: number): Promise<boolean> {
    const isAdmin = await roleService.isAdmin(userId)

    if (audienceType === 'doxa') return isAdmin

    if (audienceType === 'people_group' && peopleGroupId) {
      if (isAdmin) return true
      return await peopleGroupAccessService.userHasAccess(userId, peopleGroupId)
    }

    return false
  }
}

export const marketingEmailService = new MarketingEmailService()
