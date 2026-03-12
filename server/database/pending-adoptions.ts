import { getDatabase } from './db'

export interface PendingAdoption {
  id: number
  contact_method_id: number
  people_group_id: number
  group_id: number
  people_group_slug: string
  form_data: {
    show_publicly?: boolean
    locale?: string
    first_name?: string
  }
  created_at: string
  updated_at: string
}

export interface CreatePendingAdoptionData {
  contact_method_id: number
  people_group_id: number
  group_id: number
  people_group_slug: string
  form_data: Record<string, any>
}

class PendingAdoptionService {
  private db = getDatabase()

  async createOrUpdate(data: CreatePendingAdoptionData): Promise<PendingAdoption> {
    const stmt = this.db.prepare(`
      INSERT INTO pending_adoptions (contact_method_id, people_group_id, group_id, people_group_slug, form_data)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (contact_method_id, people_group_id, group_id)
      DO UPDATE SET
        form_data = EXCLUDED.form_data,
        contact_method_id = EXCLUDED.contact_method_id,
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      RETURNING *
    `)
    return await stmt.get(
      data.contact_method_id,
      data.people_group_id,
      data.group_id,
      data.people_group_slug,
      data.form_data
    ) as PendingAdoption
  }

  async getByContactMethodId(contactMethodId: number): Promise<PendingAdoption[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM pending_adoptions
      WHERE contact_method_id = ?
      ORDER BY created_at ASC
    `)
    return await stmt.all(contactMethodId) as PendingAdoption[]
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM pending_adoptions WHERE id = ?').run(id)
    return result.changes > 0
  }

  async deleteByContactMethodId(contactMethodId: number): Promise<number> {
    const result = await this.db.prepare('DELETE FROM pending_adoptions WHERE contact_method_id = ?').run(contactMethodId)
    return result.changes
  }
}

export const pendingAdoptionService = new PendingAdoptionService()
