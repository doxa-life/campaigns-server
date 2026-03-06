import { getDatabase } from './db'

export interface PeopleGroupAdoption {
  id: number
  people_group_id: number
  group_id: number
  status: 'pending' | 'active' | 'inactive'
  update_token: string
  show_publicly: boolean
  adopted_at: string | null
  created_at: string
  updated_at: string
}

export interface AdoptionWithDetails extends PeopleGroupAdoption {
  people_group_name: string
  people_group_slug: string | null
  group_name: string
  report_count: number
}

export interface CreateAdoptionData {
  people_group_id: number
  group_id: number
  status?: 'pending' | 'active' | 'inactive'
  show_publicly?: boolean
}

export interface UpdateAdoptionData {
  status?: 'pending' | 'active' | 'inactive'
  show_publicly?: boolean
  adopted_at?: string | null
}

class PeopleGroupAdoptionService {
  private db = getDatabase()

  async create(data: CreateAdoptionData): Promise<PeopleGroupAdoption> {
    const status = data.status || 'active'

    const stmt = this.db.prepare(`
      INSERT INTO people_group_adoptions (people_group_id, group_id, status, show_publicly, adopted_at)
      VALUES (?, ?, ?, ?, ${status === 'active' ? "CURRENT_TIMESTAMP AT TIME ZONE 'UTC'" : 'NULL'})
    `)
    const result = await stmt.run(
      data.people_group_id,
      data.group_id,
      status,
      data.show_publicly ?? false
    )
    return (await this.getById(result.lastInsertRowid as number))!
  }

  async getById(id: number): Promise<PeopleGroupAdoption | null> {
    const stmt = this.db.prepare('SELECT * FROM people_group_adoptions WHERE id = ?')
    return await stmt.get(id) as PeopleGroupAdoption | null
  }

  async getByToken(token: string): Promise<AdoptionWithDetails | null> {
    const stmt = this.db.prepare(`
      SELECT a.*,
        pg.name as people_group_name,
        pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.update_token = ?
    `)
    return await stmt.get(token) as AdoptionWithDetails | null
  }

  async getForGroup(groupId: number): Promise<AdoptionWithDetails[]> {
    const stmt = this.db.prepare(`
      SELECT a.*,
        pg.name as people_group_name,
        pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.group_id = ?
      ORDER BY a.created_at DESC
    `)
    return await stmt.all(groupId) as AdoptionWithDetails[]
  }

  async getForPeopleGroup(peopleGroupId: number): Promise<AdoptionWithDetails[]> {
    const stmt = this.db.prepare(`
      SELECT a.*,
        pg.name as people_group_name,
        pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.people_group_id = ?
      ORDER BY a.created_at DESC
    `)
    return await stmt.all(peopleGroupId) as AdoptionWithDetails[]
  }

  async getAllActive(): Promise<AdoptionWithDetails[]> {
    const stmt = this.db.prepare(`
      SELECT a.*,
        pg.name as people_group_name,
        pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.status = 'active'
      ORDER BY a.created_at DESC
    `)
    return await stmt.all() as AdoptionWithDetails[]
  }

  async update(id: number, data: UpdateAdoptionData): Promise<PeopleGroupAdoption | null> {
    const adoption = await this.getById(id)
    if (!adoption) return null

    const updates: string[] = []
    const values: any[] = []

    if (data.status !== undefined) {
      updates.push('status = ?')
      values.push(data.status)
      if (data.status === 'active' && !adoption.adopted_at) {
        updates.push("adopted_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
      }
    }
    if (data.show_publicly !== undefined) {
      updates.push('show_publicly = ?')
      values.push(data.show_publicly)
    }
    if (data.adopted_at !== undefined) {
      updates.push('adopted_at = ?')
      values.push(data.adopted_at)
    }

    if (updates.length === 0) return adoption

    updates.push("updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE people_group_adoptions SET ${updates.join(', ')} WHERE id = ?
    `)
    await stmt.run(...values)
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    await this.db.prepare('DELETE FROM adoption_reports WHERE adoption_id = ?').run(id)
    const result = await this.db.prepare('DELETE FROM people_group_adoptions WHERE id = ?').run(id)
    return result.changes > 0
  }

  async countForPeopleGroup(peopleGroupId: number, status?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM people_group_adoptions WHERE people_group_id = ?'
    const params: any[] = [peopleGroupId]

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    const stmt = this.db.prepare(query)
    const result = await stmt.get(...params) as { count: string | number }
    return Number(result.count)
  }
}

export const peopleGroupAdoptionService = new PeopleGroupAdoptionService()
