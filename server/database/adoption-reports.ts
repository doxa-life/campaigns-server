import { getDatabase } from './db'

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
  private db = getDatabase()

  async create(data: {
    adoption_id: number
    praying_count?: number | null
    stories?: string | null
    comments?: string | null
  }): Promise<AdoptionReport> {
    const stmt = this.db.prepare(`
      INSERT INTO adoption_reports (adoption_id, praying_count, stories, comments)
      VALUES (?, ?, ?, ?)
    `)
    const result = await stmt.run(
      data.adoption_id,
      data.praying_count ?? null,
      data.stories ?? null,
      data.comments ?? null
    )
    return (await this.getById(result.lastInsertRowid as number))!
  }

  async getById(id: number): Promise<AdoptionReport | null> {
    const stmt = this.db.prepare('SELECT * FROM adoption_reports WHERE id = ?')
    return await stmt.get(id) as AdoptionReport | null
  }

  async getForAdoption(adoptionId: number): Promise<AdoptionReport[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM adoption_reports
      WHERE adoption_id = ?
      ORDER BY submitted_at DESC
    `)
    return await stmt.all(adoptionId) as AdoptionReport[]
  }

  async getForGroup(groupId: number): Promise<AdoptionReportWithDetails[]> {
    const stmt = this.db.prepare(`
      SELECT r.*,
        pg.name as people_group_name,
        g.name as group_name
      FROM adoption_reports r
      JOIN people_group_adoptions a ON r.adoption_id = a.id
      JOIN people_groups pg ON a.people_group_id = pg.id
      JOIN groups g ON a.group_id = g.id
      WHERE a.group_id = ?
      ORDER BY r.submitted_at DESC
    `)
    return await stmt.all(groupId) as AdoptionReportWithDetails[]
  }

  async updateStatus(id: number, status: 'submitted' | 'approved' | 'rejected'): Promise<AdoptionReport | null> {
    const report = await this.getById(id)
    if (!report) return null

    const stmt = this.db.prepare('UPDATE adoption_reports SET status = ? WHERE id = ?')
    await stmt.run(status, id)
    return this.getById(id)
  }
}

export const adoptionReportService = new AdoptionReportService()
