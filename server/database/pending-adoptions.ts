import { getSql } from './db'

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
  private sql = getSql()

  async createOrUpdate(data: CreatePendingAdoptionData): Promise<PendingAdoption> {
    const [row] = await this.sql`
      INSERT INTO pending_adoptions (contact_method_id, people_group_id, group_id, people_group_slug, form_data)
      VALUES (${data.contact_method_id}, ${data.people_group_id}, ${data.group_id}, ${data.people_group_slug}, ${this.sql.json(data.form_data)})
      ON CONFLICT (contact_method_id, people_group_id, group_id)
      DO UPDATE SET
        form_data = EXCLUDED.form_data,
        contact_method_id = EXCLUDED.contact_method_id,
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      RETURNING *
    `
    return row as PendingAdoption
  }

  async getByContactMethodId(contactMethodId: number): Promise<PendingAdoption[]> {
    return await this.sql`
      SELECT * FROM pending_adoptions
      WHERE contact_method_id = ${contactMethodId}
      ORDER BY created_at ASC
    `
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM pending_adoptions WHERE id = ${id}`
    return result.count > 0
  }

  async deleteByContactMethodId(contactMethodId: number): Promise<number> {
    const result = await this.sql`DELETE FROM pending_adoptions WHERE contact_method_id = ${contactMethodId}`
    return result.count
  }
}

export const pendingAdoptionService = new PendingAdoptionService()
