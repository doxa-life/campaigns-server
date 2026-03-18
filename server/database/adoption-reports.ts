import { getSql } from './db'

export interface AdoptionReport {
  id: number
  adoption_id: number
  praying_count: number | null
  stories: string | null
  comments: string | null
  status: 'submitted' | 'approved' | 'rejected'
  submitted_at: string
  created_at: string
}

export interface AdoptionReportWithDetails extends AdoptionReport {
  people_group_name: string
  group_name: string
}

class AdoptionReportService {
  private sql = getSql()

  async create(data: {
    adoption_id: number
    praying_count?: number | null
    stories?: string | null
    comments?: string | null
  }): Promise<AdoptionReport> {
    const [row] = await this.sql`
      INSERT INTO adoption_reports (adoption_id, praying_count, stories, comments)
      VALUES (${data.adoption_id}, ${data.praying_count ?? null}, ${data.stories ?? null}, ${data.comments ?? null})
      RETURNING *
    `
    return row
  }

  async getById(id: number): Promise<AdoptionReport | null> {
    const [row] = await this.sql`SELECT * FROM adoption_reports WHERE id = ${id}`
    return row || null
  }

  async getForAdoption(adoptionId: number): Promise<AdoptionReport[]> {
    return await this.sql`
      SELECT * FROM adoption_reports
      WHERE adoption_id = ${adoptionId}
      ORDER BY submitted_at DESC
    `
  }

  async getForGroup(groupId: number): Promise<AdoptionReportWithDetails[]> {
    return await this.sql`
      SELECT r.*,
        pg.name as people_group_name,
        g.name as group_name
      FROM adoption_reports r
      JOIN people_group_adoptions a ON r.adoption_id = a.id
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.group_id = ${groupId}
      ORDER BY r.submitted_at DESC
    `
  }

  async updateStatus(id: number, status: 'submitted' | 'approved' | 'rejected'): Promise<AdoptionReport | null> {
    const [row] = await this.sql`
      UPDATE adoption_reports SET status = ${status} WHERE id = ${id}
      RETURNING *
    `
    return row || null
  }
}

export const adoptionReportService = new AdoptionReportService()
