import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'

export interface Group {
  id: number
  name: string
  primary_subscriber_id: number | null
  country: string | null
  created_at: string
  updated_at: string
}

export interface GroupWithDetails extends Group {
  primary_subscriber_name: string | null
  primary_subscriber_email: string | null
  subscriber_count: number
  adoption_count: number
}

export interface CreateGroupData {
  name: string
  primary_subscriber_id?: number | null
  country?: string | null
}

export interface UpdateGroupData {
  name?: string
  primary_subscriber_id?: number | null
  country?: string | null
}

class GroupService {
  private sql = getSql()

  async create(data: CreateGroupData): Promise<Group> {
    const [row] = await this.sql`
      INSERT INTO groups (name, primary_subscriber_id, country)
      VALUES (${data.name}, ${data.primary_subscriber_id || null}, ${data.country || null})
      RETURNING *
    `
    return row
  }

  async getById(id: number): Promise<Group | null> {
    const [row] = await this.sql`SELECT * FROM groups WHERE id = ${id}`
    return row || null
  }

  async getAll(options?: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<GroupWithDetails[]> {
    const search = options?.search ? `%${options.search}%` : null
    const limit = options?.limit || null
    const offset = options?.offset || null

    const baseQuery = this.sql`
      SELECT g.*,
        s.name as primary_subscriber_name,
        (SELECT cm.value FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.type = 'email' ORDER BY cm.verified DESC, cm.created_at ASC LIMIT 1) as primary_subscriber_email,
        (SELECT COUNT(*) FROM connections WHERE from_type = 'subscriber' AND to_type = 'group' AND to_id = g.id) as subscriber_count,
        (SELECT COUNT(*) FROM people_group_adoptions WHERE group_id = g.id) as adoption_count
      FROM groups g
      LEFT JOIN subscribers s ON g.primary_subscriber_id = s.id
    `

    if (search && limit) {
      return await this.sql`
        ${baseQuery}
        WHERE g.name ILIKE ${search}
        ORDER BY g.created_at DESC LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    if (search) {
      return await this.sql`${baseQuery} WHERE g.name ILIKE ${search} ORDER BY g.created_at DESC`
    }
    if (limit) {
      return await this.sql`${baseQuery} ORDER BY g.created_at DESC LIMIT ${limit} OFFSET ${offset || 0}`
    }
    return await this.sql`${baseQuery} ORDER BY g.created_at DESC`
  }

  async count(search?: string): Promise<number> {
    if (search) {
      const [result] = await this.sql`SELECT COUNT(*) as count FROM groups WHERE name ILIKE ${`%${search}%`}`
      return Number(result.count)
    }
    const [result] = await this.sql`SELECT COUNT(*) as count FROM groups`
    return Number(result.count)
  }

  async update(id: number, data: UpdateGroupData): Promise<Group | null> {
    const group = await this.getById(id)
    if (!group) return null

    const fields: Fragment[] = []

    if (data.name !== undefined) fields.push(this.sql`name = ${data.name}`)
    if (data.primary_subscriber_id !== undefined) fields.push(this.sql`primary_subscriber_id = ${data.primary_subscriber_id}`)
    if (data.country !== undefined) fields.push(this.sql`country = ${data.country}`)

    if (fields.length === 0) return group

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE groups SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    return await this.sql.begin(async (tx) => {
      await tx`
        DELETE FROM adoption_reports WHERE adoption_id IN (
          SELECT id FROM people_group_adoptions WHERE group_id = ${id}
        )
      `
      await tx`DELETE FROM people_group_adoptions WHERE group_id = ${id}`
      await tx`
        DELETE FROM connections
        WHERE (from_type = 'group' AND from_id = ${id}) OR (to_type = 'group' AND to_id = ${id})
      `
      const result = await tx`DELETE FROM groups WHERE id = ${id}`
      return result.count > 0
    })
  }
}

export const groupService = new GroupService()
