import { getDatabase } from './db'
import { roleService } from './roles'
import { peopleGroupAccessService } from './people-group-access'

export interface PeopleGroup {
  id: number
  joshua_project_id: string | null
  name: string
  slug: string | null
  image_url: string | null
  metadata: string | null
  random_order: number | null
  people_praying: number
  daily_prayer_duration: number
  // Normalized columns
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
  metadata?: string | null
}

export interface UpdatePeopleGroupData {
  joshua_project_id?: string | null
  name?: string
  slug?: string
  image_url?: string | null
  metadata?: string | null
  people_praying?: number
  daily_prayer_duration?: number
  // Normalized columns
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
  private db = getDatabase()

  async createPeopleGroup(data: CreatePeopleGroupData): Promise<PeopleGroup> {
    const { name, image_url = null, metadata = null } = data

    const stmt = this.db.prepare(`
      INSERT INTO people_groups (name, image_url, metadata)
      VALUES (?, ?, ?)
    `)

    try {
      const result = await stmt.run(name, image_url, metadata)
      const id = result.lastInsertRowid as number
      return (await this.getPeopleGroupById(id))!
    } catch (error: any) {
      throw error
    }
  }

  async getPeopleGroupById(id: number): Promise<PeopleGroup | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM people_groups WHERE id = ?
    `)
    const peopleGroup = await stmt.get(id) as PeopleGroup | null
    return peopleGroup
  }

  async getPeopleGroupByRandomOrder(randomOrder: number): Promise<PeopleGroup | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM people_groups WHERE random_order = ?
    `)
    const peopleGroup = await stmt.get(randomOrder) as PeopleGroup | null
    return peopleGroup
  }

  async getPeopleGroupBySlug(slug: string): Promise<PeopleGroup | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM people_groups WHERE slug = ?
    `)
    const peopleGroup = await stmt.get(slug) as PeopleGroup | null
    return peopleGroup
  }

  async getAllPeopleGroups(options?: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<PeopleGroup[]> {
    let query = `SELECT * FROM people_groups`
    const params: any[] = []

    if (options?.search) {
      query += ' WHERE name ILIKE ?'
      params.push(`%${options.search}%`)
    }

    query += ' ORDER BY name'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)

      if (options?.offset) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }
    }

    const stmt = this.db.prepare(query)
    const peopleGroups = await stmt.all(...params) as PeopleGroup[]
    return peopleGroups
  }

  async updatePeopleGroup(id: number, data: UpdatePeopleGroupData): Promise<PeopleGroup | null> {
    const peopleGroup = await this.getPeopleGroupById(id)
    if (!peopleGroup) {
      return null
    }

    const updates: string[] = []
    const values: any[] = []

    if (data.joshua_project_id !== undefined) {
      updates.push('joshua_project_id = ?')
      values.push(data.joshua_project_id)
    }

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }

    if (data.slug !== undefined) {
      if (!(await this.isSlugUnique(data.slug, id))) {
        throw new Error('Slug already exists')
      }
      updates.push('slug = ?')
      values.push(data.slug)
    }

    if (data.image_url !== undefined) {
      updates.push('image_url = ?')
      values.push(data.image_url)
    }

    if (data.metadata !== undefined) {
      updates.push('metadata = ?')
      values.push(data.metadata)
    }

    if (data.people_praying !== undefined) {
      updates.push('people_praying = ?')
      values.push(data.people_praying)
    }

    if (data.daily_prayer_duration !== undefined) {
      updates.push('daily_prayer_duration = ?')
      values.push(data.daily_prayer_duration)
    }

    // Normalized columns
    if (data.country_code !== undefined) {
      updates.push('country_code = ?')
      values.push(data.country_code)
    }

    if (data.region !== undefined) {
      updates.push('region = ?')
      values.push(data.region)
    }

    if (data.latitude !== undefined) {
      updates.push('latitude = ?')
      values.push(data.latitude)
    }

    if (data.longitude !== undefined) {
      updates.push('longitude = ?')
      values.push(data.longitude)
    }

    if (data.population !== undefined) {
      updates.push('population = ?')
      values.push(data.population)
    }

    if (data.evangelical_pct !== undefined) {
      updates.push('evangelical_pct = ?')
      values.push(data.evangelical_pct)
    }

    if (data.engagement_status !== undefined) {
      updates.push('engagement_status = ?')
      values.push(data.engagement_status)
    }

    if (data.primary_religion !== undefined) {
      updates.push('primary_religion = ?')
      values.push(data.primary_religion)
    }

    if (data.primary_language !== undefined) {
      updates.push('primary_language = ?')
      values.push(data.primary_language)
    }

    if (data.descriptions !== undefined) {
      updates.push('descriptions = ?')
      const desc = typeof data.descriptions === 'string'
        ? JSON.parse(data.descriptions)
        : data.descriptions
      values.push(desc)
    }

    if (updates.length === 0) {
      return peopleGroup
    }

    updates.push("updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE people_groups SET ${updates.join(', ')}
      WHERE id = ?
    `)

    try {
      await stmt.run(...values)
      return this.getPeopleGroupById(id)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('A people group with this slug already exists')
      }
      throw error
    }
  }

  async deletePeopleGroup(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM people_groups WHERE id = ?')
    const result = await stmt.run(id)
    return result.changes > 0
  }

  async countPeopleGroups(search?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM people_groups'
    const params: any[] = []

    if (search) {
      query += ' WHERE name ILIKE ?'
      params.push(`%${search}%`)
    }

    const stmt = this.db.prepare(query)
    const result = await stmt.get(...params) as { count: string | number }
    return Number(result.count)
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
    const stmt = this.db.prepare(`
      SELECT id FROM people_groups WHERE slug = ? ${excludeId ? 'AND id != ?' : ''}
    `)
    const result = excludeId ? await stmt.get(slug, excludeId) : await stmt.get(slug)
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
    if (isAdmin) {
      return true
    }
    return await peopleGroupAccessService.userHasAccess(userId, peopleGroupId)
  }

  async getRemainingUnadoptedCount(): Promise<number> {
    const [totalRow, adoptedRow] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as count FROM people_groups').get() as Promise<{ count: string | number }>,
      this.db.prepare("SELECT COUNT(DISTINCT people_group_id) as count FROM people_group_adoptions WHERE status = 'active'").get() as Promise<{ count: string | number }>,
    ])
    return Number(totalRow.count) - Number(adoptedRow.count)
  }

  async getPeopleGroupsForUser(userId: string): Promise<PeopleGroup[]> {
    const isAdmin = await roleService.isAdmin(userId)
    if (isAdmin) {
      return this.getAllPeopleGroups()
    }

    const peopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(userId)
    if (peopleGroupIds.length === 0) {
      return []
    }

    const placeholders = peopleGroupIds.map(() => '?').join(',')
    const stmt = this.db.prepare(`
      SELECT * FROM people_groups
      WHERE id IN (${placeholders})
      ORDER BY name
    `)

    return await stmt.all(...peopleGroupIds) as PeopleGroup[]
  }
}

export const peopleGroupService = new PeopleGroupService()
