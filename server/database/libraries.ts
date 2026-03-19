import type { Sql, Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'

export type LibraryType = 'static' | 'people_group'

export const PEOPLE_GROUP_LIBRARY_ID = -1
export const PEOPLE_GROUP_LIBRARY: Library = {
  id: PEOPLE_GROUP_LIBRARY_ID,
  name: 'People Group',
  description: 'Dynamically displays the linked people group information',
  type: 'people_group',
  repeating: false,
  people_group_id: null,
  library_key: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
}

export const DAILY_PEOPLE_GROUP_LIBRARY_ID = -2
export const DAILY_PEOPLE_GROUP_LIBRARY: Library = {
  id: DAILY_PEOPLE_GROUP_LIBRARY_ID,
  name: 'Daily People Group',
  description: 'Displays a different people group each day, rotating through all groups',
  type: 'people_group',
  repeating: false,
  people_group_id: null,
  library_key: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
}

export const DAY_IN_LIFE_LIBRARY_ID = -3
export const DAY_IN_LIFE_LIBRARY: Library = {
  id: DAY_IN_LIFE_LIBRARY_ID,
  name: 'Day in the Life',
  description: 'Displays day in the life content from the people group\'s day_in_life library',
  type: 'static',
  repeating: true,
  people_group_id: null,
  library_key: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
}

export interface Library {
  id: number
  name: string
  description: string
  type: LibraryType
  repeating: boolean
  people_group_id: number | null
  library_key: string | null
  created_at: string
  updated_at: string
}

export interface CreateLibraryData {
  name: string
  description?: string
  repeating?: boolean
  people_group_id?: number | null
  library_key?: string | null
}

export interface UpdateLibraryData {
  name?: string
  description?: string
  repeating?: boolean
  people_group_id?: number | null
  library_key?: string | null
}

export interface LibraryExportData {
  version: string
  exportedAt: string
  library: {
    name: string
    description: string
    type: LibraryType
    repeating: boolean
    library_key: string | null
  }
  content: Array<{
    day_number: number
    language_code: string
    content_json: Record<string, any> | null
  }>
  stats: {
    totalDays: number
    totalContentItems: number
    languageCoverage: Record<string, number>
  }
}

export class LibraryService {
  private sql = getSql()

  async createLibrary(data: CreateLibraryData, db?: Sql): Promise<Library> {
    const s = db || this.sql
    const { name, description = '', repeating = false, people_group_id = null, library_key = null } = data

    try {
      const [row] = await s`
        INSERT INTO libraries (name, description, repeating, people_group_id, library_key)
        VALUES (${name}, ${description}, ${repeating}, ${people_group_id}, ${library_key})
        RETURNING *
      `
      return row
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('A library with this name already exists')
      }
      throw error
    }
  }

  async getLibraryById(id: number, db?: Sql): Promise<Library | null> {
    const s = db || this.sql

    if (id === PEOPLE_GROUP_LIBRARY_ID) return PEOPLE_GROUP_LIBRARY
    if (id === DAILY_PEOPLE_GROUP_LIBRARY_ID) return DAILY_PEOPLE_GROUP_LIBRARY
    if (id === DAY_IN_LIFE_LIBRARY_ID) return DAY_IN_LIFE_LIBRARY

    const [row] = await s`SELECT * FROM libraries WHERE id = ${id}`
    return row || null
  }

  async getPeopleGroupLibraryByKey(peopleGroupId: number, libraryKey: string): Promise<Library | null> {
    const [row] = await this.sql`
      SELECT * FROM libraries WHERE people_group_id = ${peopleGroupId} AND library_key = ${libraryKey}
    `
    return row || null
  }

  async getPeopleGroupLibraries(peopleGroupId: number): Promise<Library[]> {
    return await this.sql`
      SELECT * FROM libraries WHERE people_group_id = ${peopleGroupId} ORDER BY name
    `
  }

  async getAllLibraries(options?: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<Library[]> {
    const search = options?.search ? `%${options.search}%` : null
    const limit = options?.limit || null
    const offset = options?.offset || null

    if (search && limit) {
      return await this.sql`
        SELECT * FROM libraries WHERE people_group_id IS NULL AND name ILIKE ${search}
        ORDER BY name LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    if (search) {
      return await this.sql`
        SELECT * FROM libraries WHERE people_group_id IS NULL AND name ILIKE ${search}
        ORDER BY name
      `
    }
    if (limit) {
      return await this.sql`
        SELECT * FROM libraries WHERE people_group_id IS NULL
        ORDER BY name LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    return await this.sql`SELECT * FROM libraries WHERE people_group_id IS NULL ORDER BY name`
  }

  async updateLibrary(id: number, data: UpdateLibraryData): Promise<Library | null> {
    const library = await this.getLibraryById(id)
    if (!library) return null

    const fields: Fragment[] = []

    if (data.name !== undefined) fields.push(this.sql`name = ${data.name}`)
    if (data.description !== undefined) fields.push(this.sql`description = ${data.description}`)
    if (data.repeating !== undefined) fields.push(this.sql`repeating = ${data.repeating}`)
    if (data.people_group_id !== undefined) fields.push(this.sql`people_group_id = ${data.people_group_id}`)
    if (data.library_key !== undefined) fields.push(this.sql`library_key = ${data.library_key}`)

    if (fields.length === 0) return library

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    try {
      await this.sql`UPDATE libraries SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
      return this.getLibraryById(id)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('A library with this name already exists')
      }
      throw error
    }
  }

  async deleteLibrary(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM libraries WHERE id = ${id}`
    return result.count > 0
  }

  async getDistinctLibraryKeys(): Promise<string[]> {
    const results = await this.sql`
      SELECT DISTINCT library_key FROM libraries
      WHERE library_key IS NOT NULL
      ORDER BY library_key
    `
    return results.map((r: any) => r.library_key)
  }

  async getLibraryStats(id: number, db?: Sql): Promise<{
    totalDays: number
    languageStats: { [key: string]: number }
  }> {
    const s = db || this.sql

    if (id === PEOPLE_GROUP_LIBRARY_ID || id === DAILY_PEOPLE_GROUP_LIBRARY_ID || id === DAY_IN_LIFE_LIBRARY_ID) {
      return { totalDays: -1, languageStats: {} }
    }

    const library = await this.getLibraryById(id, db)
    if (library?.type === 'people_group') {
      return { totalDays: -1, languageStats: {} }
    }

    const [daysResult] = await s`
      SELECT COUNT(DISTINCT day_number) as count
      FROM library_content WHERE library_id = ${id}
    `

    const langResults = await s`
      SELECT language_code, COUNT(*) as count
      FROM library_content WHERE library_id = ${id}
      GROUP BY language_code
    `

    const languageStats: { [key: string]: number } = {}
    langResults.forEach((r: any) => {
      languageStats[r.language_code] = r.count
    })

    return { totalDays: daysResult.count, languageStats }
  }

  async libraryNameExists(name: string): Promise<boolean> {
    const [result] = await this.sql`SELECT COUNT(*) as count FROM libraries WHERE name = ${name}`
    return result.count > 0
  }

  async generateUniqueName(baseName: string): Promise<string> {
    let name = baseName
    let counter = 1

    while (await this.libraryNameExists(name)) {
      name = `${baseName} (${counter})`
      counter++
    }

    return name
  }
}

export const libraryService = new LibraryService()
