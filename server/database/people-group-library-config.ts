import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'

export interface PeopleGroupLibraryConfig {
  id: number
  people_group_id: number
  library_id: number
  order_index: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreatePeopleGroupLibraryConfigData {
  people_group_id: number
  library_id: number
  order_index: number
  enabled?: boolean
}

export interface UpdatePeopleGroupLibraryConfigData {
  order_index?: number
  enabled?: boolean
}

export class PeopleGroupLibraryConfigService {
  private sql = getSql()

  async addLibraryToPeopleGroup(data: CreatePeopleGroupLibraryConfigData): Promise<PeopleGroupLibraryConfig> {
    const { people_group_id, library_id, order_index, enabled = true } = data

    try {
      const [row] = await this.sql`
        INSERT INTO campaign_library_config (people_group_id, library_id, order_index, enabled)
        VALUES (${people_group_id}, ${library_id}, ${order_index}, ${enabled})
        RETURNING *
      `
      return row
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('This library is already configured for this people group')
      }
      throw error
    }
  }

  async getConfigById(id: number): Promise<PeopleGroupLibraryConfig | null> {
    const [row] = await this.sql`SELECT * FROM campaign_library_config WHERE id = ${id}`
    return row || null
  }

  async getPeopleGroupLibraries(peopleGroupId: number, includeDisabled: boolean = false): Promise<PeopleGroupLibraryConfig[]> {
    if (includeDisabled) {
      return await this.sql`
        SELECT * FROM campaign_library_config
        WHERE people_group_id = ${peopleGroupId}
        ORDER BY order_index ASC
      `
    }
    return await this.sql`
      SELECT * FROM campaign_library_config
      WHERE people_group_id = ${peopleGroupId} AND enabled = true
      ORDER BY order_index ASC
    `
  }

  async getLibraryPeopleGroups(libraryId: number): Promise<PeopleGroupLibraryConfig[]> {
    return await this.sql`
      SELECT * FROM campaign_library_config
      WHERE library_id = ${libraryId}
      ORDER BY people_group_id, order_index ASC
    `
  }

  async updateConfig(id: number, data: UpdatePeopleGroupLibraryConfigData): Promise<PeopleGroupLibraryConfig | null> {
    const config = await this.getConfigById(id)
    if (!config) return null

    const fields: Fragment[] = []

    if (data.order_index !== undefined) fields.push(this.sql`order_index = ${data.order_index}`)
    if (data.enabled !== undefined) fields.push(this.sql`enabled = ${data.enabled}`)

    if (fields.length === 0) return config

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE campaign_library_config SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getConfigById(id)
  }

  async removeLibraryFromPeopleGroup(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM campaign_library_config WHERE id = ${id}`
    return result.count > 0
  }

  async removeLibraryByPeopleGroupAndLibrary(peopleGroupId: number, libraryId: number): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM campaign_library_config WHERE people_group_id = ${peopleGroupId} AND library_id = ${libraryId}
    `
    return result.count > 0
  }

  async updatePeopleGroupLibrariesOrder(peopleGroupId: number, libraryOrders: Array<{ library_id: number; order_index: number }>): Promise<void> {
    for (const { library_id, order_index } of libraryOrders) {
      await this.sql`
        UPDATE campaign_library_config
        SET order_index = ${order_index}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE people_group_id = ${peopleGroupId} AND library_id = ${library_id}
      `
    }
  }

  async setPeopleGroupLibraries(peopleGroupId: number, libraryIds: number[]): Promise<void> {
    await this.sql`DELETE FROM campaign_library_config WHERE people_group_id = ${peopleGroupId}`

    for (let i = 0; i < libraryIds.length; i++) {
      await this.sql`
        INSERT INTO campaign_library_config (people_group_id, library_id, order_index, enabled)
        VALUES (${peopleGroupId}, ${libraryIds[i]}, ${i + 1}, true)
      `
    }
  }
}

export const peopleGroupLibraryConfigService = new PeopleGroupLibraryConfigService()
