import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'

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
  private sql = getSql()

  async create(data: CreateAdoptionData): Promise<PeopleGroupAdoption> {
    const status = data.status || 'active'

    const [row] = await this.sql`
      INSERT INTO people_group_adoptions (people_group_id, group_id, status, show_publicly, adopted_at)
      VALUES (${data.people_group_id}, ${data.group_id}, ${status}, ${data.show_publicly ?? false},
              ${status === 'active' ? new Date().toISOString() : null})
      RETURNING *
    `
    return row as PeopleGroupAdoption
  }

  async getById(id: number): Promise<PeopleGroupAdoption | null> {
    const [row] = await this.sql`SELECT * FROM people_group_adoptions WHERE id = ${id}`
    return (row as PeopleGroupAdoption) || null
  }

  async getByToken(token: string): Promise<AdoptionWithDetails | null> {
    const [row] = await this.sql`
      SELECT a.*, pg.name as people_group_name, pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.update_token = ${token}
    `
    return (row as AdoptionWithDetails) || null
  }

  async getForGroup(groupId: number): Promise<AdoptionWithDetails[]> {
    return await this.sql`
      SELECT a.*, pg.name as people_group_name, pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.group_id = ${groupId}
      ORDER BY a.created_at DESC
    `
  }

  async getForPeopleGroup(peopleGroupId: number): Promise<AdoptionWithDetails[]> {
    return await this.sql`
      SELECT a.*, pg.name as people_group_name, pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.people_group_id = ${peopleGroupId}
      ORDER BY a.created_at DESC
    `
  }

  async getAllActive(): Promise<AdoptionWithDetails[]> {
    return await this.sql`
      SELECT a.*, pg.name as people_group_name, pg.slug as people_group_slug,
        g.name as group_name,
        (SELECT COUNT(*) FROM adoption_reports WHERE adoption_id = a.id) as report_count
      FROM people_group_adoptions a
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.status = 'active'
      ORDER BY a.created_at DESC
    `
  }

  async update(id: number, data: UpdateAdoptionData): Promise<PeopleGroupAdoption | null> {
    const adoption = await this.getById(id)
    if (!adoption) return null

    const fields: Fragment[] = []

    if (data.status !== undefined) {
      fields.push(this.sql`status = ${data.status}`)
      if (data.status === 'active' && !adoption.adopted_at) {
        fields.push(this.sql`adopted_at = ${new Date().toISOString()}`)
      }
    }
    if (data.show_publicly !== undefined) fields.push(this.sql`show_publicly = ${data.show_publicly}`)
    if (data.adopted_at !== undefined) fields.push(this.sql`adopted_at = ${data.adopted_at}`)

    if (fields.length === 0) return adoption

    fields.push(this.sql`updated_at = ${new Date().toISOString()}`)

    await this.sql`UPDATE people_group_adoptions SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    await this.sql`DELETE FROM adoption_reports WHERE adoption_id = ${id}`
    const result = await this.sql`DELETE FROM people_group_adoptions WHERE id = ${id}`
    return result.count > 0
  }

  async countForPeopleGroup(peopleGroupId: number, status?: string): Promise<number> {
    if (status) {
      const [result] = await this.sql`
        SELECT COUNT(*) as count FROM people_group_adoptions
        WHERE people_group_id = ${peopleGroupId} AND status = ${status}
      `
      return Number(result?.count)
    }
    const [result] = await this.sql`
      SELECT COUNT(*) as count FROM people_group_adoptions WHERE people_group_id = ${peopleGroupId}
    `
    return Number(result?.count)
  }
}

export const peopleGroupAdoptionService = new PeopleGroupAdoptionService()
