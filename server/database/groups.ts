import { getDatabase } from './db'

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
  private db = getDatabase()

  async create(data: CreateGroupData): Promise<Group> {
    const stmt = this.db.prepare(`
      INSERT INTO groups (name, primary_subscriber_id, country)
      VALUES (?, ?, ?)
    `)
    const result = await stmt.run(data.name, data.primary_subscriber_id || null, data.country || null)
    return (await this.getById(result.lastInsertRowid as number))!
  }

  async getById(id: number): Promise<Group | null> {
    const stmt = this.db.prepare('SELECT * FROM groups WHERE id = ?')
    return await stmt.get(id) as Group | null
  }

  async getAll(options?: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<GroupWithDetails[]> {
    let query = `
      SELECT g.*,
        s.name as primary_subscriber_name,
        (SELECT cm.value FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.type = 'email' ORDER BY cm.verified DESC, cm.created_at ASC LIMIT 1) as primary_subscriber_email,
        (SELECT COUNT(*) FROM connections WHERE from_type = 'subscriber' AND to_type = 'group' AND to_id = g.id) as subscriber_count,
        (SELECT COUNT(*) FROM people_group_adoptions WHERE group_id = g.id) as adoption_count
      FROM groups g
      LEFT JOIN subscribers s ON g.primary_subscriber_id = s.id
    `
    const params: any[] = []

    if (options?.search) {
      query += ' WHERE g.name ILIKE ?'
      params.push(`%${options.search}%`)
    }

    query += ' ORDER BY g.created_at DESC'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)
      if (options?.offset) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }
    }

    const stmt = this.db.prepare(query)
    return await stmt.all(...params) as GroupWithDetails[]
  }

  async count(search?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM groups'
    const params: any[] = []

    if (search) {
      query += ' WHERE name ILIKE ?'
      params.push(`%${search}%`)
    }

    const stmt = this.db.prepare(query)
    const result = await stmt.get(...params) as { count: string | number }
    return Number(result.count)
  }

  async update(id: number, data: UpdateGroupData): Promise<Group | null> {
    const group = await this.getById(id)
    if (!group) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.primary_subscriber_id !== undefined) {
      updates.push('primary_subscriber_id = ?')
      values.push(data.primary_subscriber_id)
    }
    if (data.country !== undefined) {
      updates.push('country = ?')
      values.push(data.country)
    }

    if (updates.length === 0) return group

    updates.push("updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE groups SET ${updates.join(', ')} WHERE id = ?
    `)
    await stmt.run(...values)
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM groups WHERE id = ?')
    const result = await stmt.run(id)
    return result.changes > 0
  }
}

export const groupService = new GroupService()
