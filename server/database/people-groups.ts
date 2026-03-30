import type { Sql } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'
import { roleService } from './roles'
import { peopleGroupAccessService } from './people-group-access'

export interface PeopleGroup {
  id: number
  joshua_project_id: string | null
  name: string
  slug: string | null
  image_url: string | null
  metadata: Record<string, any> | null
  random_order: number | null
  people_praying: number
  daily_prayer_duration: number
  country_code: string | null
  region: string | null
  latitude: number | null
  longitude: number | null
  population: number | null
  evangelical_pct: number | null
  engagement_status: string | null
  primary_religion: string | null
  primary_language: string | null
  descriptions: Record<string, string> | null
  created_at: string
  updated_at: string
}

export interface CreatePeopleGroupData {
  name: string
  image_url?: string | null
  metadata?: Record<string, any> | null
}

export interface UpdatePeopleGroupData {
  joshua_project_id?: string | null
  name?: string
  slug?: string
  image_url?: string | null
  metadata?: Record<string, any> | null
  people_praying?: number
  daily_prayer_duration?: number
  country_code?: string | null
  region?: string | null
  latitude?: number | null
  longitude?: number | null
  population?: number | null
  evangelical_pct?: number | null
  engagement_status?: string | null
  primary_religion?: string | null
  primary_language?: string | null
  descriptions?: Record<string, string> | null
}

export class PeopleGroupService {
  private sql = getSql()

  async createPeopleGroup(data: CreatePeopleGroupData): Promise<PeopleGroup> {
    const { name, image_url = null, metadata = null } = data

    const [row] = await this.sql`
      INSERT INTO people_groups (name, image_url, metadata)
      VALUES (${name}, ${image_url}, ${metadata ? this.sql.json(metadata) : null})
      RETURNING *
    `
    return row as PeopleGroup
  }

  async getPeopleGroupById(id: number): Promise<PeopleGroup | null> {
    const [row] = await this.sql`SELECT * FROM people_groups WHERE id = ${id}`
    return (row as PeopleGroup) || null
  }

  async getPeopleGroupByRandomOrder(randomOrder: number): Promise<PeopleGroup | null> {
    const [row] = await this.sql`SELECT * FROM people_groups WHERE random_order = ${randomOrder}`
    return (row as PeopleGroup) || null
  }

  async getPeopleGroupBySlug(slug: string): Promise<PeopleGroup | null> {
    const [row] = await this.sql`SELECT * FROM people_groups WHERE slug = ${slug}`
    return (row as PeopleGroup) || null
  }

  async getAllPeopleGroups(options?: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<PeopleGroup[]> {
    const search = options?.search ? `%${options.search}%` : null
    const limit = options?.limit || null
    const offset = options?.offset || null

    if (search && limit) {
      return await this.sql`
        SELECT * FROM people_groups
        WHERE name ILIKE ${search}
        ORDER BY name
        LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    if (search) {
      return await this.sql`
        SELECT * FROM people_groups
        WHERE name ILIKE ${search}
        ORDER BY name
      `
    }
    if (limit) {
      return await this.sql`
        SELECT * FROM people_groups
        ORDER BY name
        LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    return await this.sql`SELECT * FROM people_groups ORDER BY name`
  }

  async updatePeopleGroup(id: number, data: UpdatePeopleGroupData): Promise<PeopleGroup | null> {
    const peopleGroup = await this.getPeopleGroupById(id)
    if (!peopleGroup) return null

    if (data.slug !== undefined) {
      if (!(await this.isSlugUnique(data.slug, id))) {
        throw new Error('Slug already exists')
      }
    }

    const fields: ReturnType<typeof this.sql>[] = []

    if (data.joshua_project_id !== undefined) fields.push(this.sql`joshua_project_id = ${data.joshua_project_id}`)
    if (data.name !== undefined) fields.push(this.sql`name = ${data.name}`)
    if (data.slug !== undefined) fields.push(this.sql`slug = ${data.slug}`)
    if (data.image_url !== undefined) fields.push(this.sql`image_url = ${data.image_url}`)
    if (data.metadata !== undefined) fields.push(this.sql`metadata = ${data.metadata ? this.sql.json(data.metadata) : null}`)
    if (data.people_praying !== undefined) fields.push(this.sql`people_praying = ${data.people_praying}`)
    if (data.daily_prayer_duration !== undefined) fields.push(this.sql`daily_prayer_duration = ${data.daily_prayer_duration}`)
    if (data.country_code !== undefined) fields.push(this.sql`country_code = ${data.country_code}`)
    if (data.region !== undefined) fields.push(this.sql`region = ${data.region}`)
    if (data.latitude !== undefined) fields.push(this.sql`latitude = ${data.latitude}`)
    if (data.longitude !== undefined) fields.push(this.sql`longitude = ${data.longitude}`)
    if (data.population !== undefined) fields.push(this.sql`population = ${data.population}`)
    if (data.evangelical_pct !== undefined) fields.push(this.sql`evangelical_pct = ${data.evangelical_pct}`)
    if (data.engagement_status !== undefined) fields.push(this.sql`engagement_status = ${data.engagement_status}`)
    if (data.primary_religion !== undefined) fields.push(this.sql`primary_religion = ${data.primary_religion}`)
    if (data.primary_language !== undefined) fields.push(this.sql`primary_language = ${data.primary_language}`)
    if (data.descriptions !== undefined) {
      const desc = typeof data.descriptions === 'string'
        ? JSON.parse(data.descriptions)
        : data.descriptions
      fields.push(this.sql`descriptions = ${this.sql.json(desc)}`)
    }

    if (fields.length === 0) return peopleGroup

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    try {
      await this.sql`UPDATE people_groups SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
      return this.getPeopleGroupById(id)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('A people group with this slug already exists')
      }
      throw error
    }
  }

  async deletePeopleGroup(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM people_groups WHERE id = ${id}`
    return result.count > 0
  }

  async countPeopleGroups(search?: string): Promise<number> {
    if (search) {
      const [result] = await this.sql`SELECT COUNT(*) as count FROM people_groups WHERE name ILIKE ${`%${search}%`}`
      return Number(result?.count)
    }
    const [result] = await this.sql`SELECT COUNT(*) as count FROM people_groups`
    return Number(result?.count)
  }

  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  async isSlugUnique(slug: string, excludeId?: number): Promise<boolean> {
    if (excludeId) {
      const [result] = await this.sql`SELECT id FROM people_groups WHERE slug = ${slug} AND id != ${excludeId}`
      return !result
    }
    const [result] = await this.sql`SELECT id FROM people_groups WHERE slug = ${slug}`
    return !result
  }

  async generateUniqueSlug(name: string, excludeId?: number): Promise<string> {
    let slug = this.generateSlug(name)
    let counter = 1

    while (!(await this.isSlugUnique(slug, excludeId))) {
      slug = `${this.generateSlug(name)}-${counter}`
      counter++
    }

    return slug
  }

  async userCanAccessPeopleGroup(userId: string, peopleGroupId: number): Promise<boolean> {
    const isAdmin = await roleService.isAdmin(userId)
    if (isAdmin) return true
    return await peopleGroupAccessService.userHasAccess(userId, peopleGroupId)
  }

  async getRemainingUnadoptedCount(): Promise<number> {
    const [[totalRow], [adoptedRow]] = await Promise.all([
      this.sql`SELECT COUNT(*) as count FROM people_groups`,
      this.sql`SELECT COUNT(DISTINCT people_group_id) as count FROM people_group_adoptions WHERE status = 'active'`,
    ])
    return Number(totalRow?.count) - Number(adoptedRow?.count)
  }

  async getPeopleGroupsForUser(userId: string): Promise<PeopleGroup[]> {
    const isAdmin = await roleService.isAdmin(userId)
    if (isAdmin) return this.getAllPeopleGroups()

    const peopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(userId)
    if (peopleGroupIds.length === 0) return []

    return await this.sql`
      SELECT * FROM people_groups
      WHERE id IN ${this.sql(peopleGroupIds)}
      ORDER BY name
    `
  }
}

export const peopleGroupService = new PeopleGroupService()
