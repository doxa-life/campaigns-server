import { getSql } from './db'

export interface PeopleGroupReport {
  id: number
  people_group_id: number
  reporter_name: string
  reporter_email: string | null
  suggested_changes: Record<string, any>
  previous_values: Record<string, any> | null
  status: 'pending' | 'accepted' | 'denied'
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PeopleGroupReportWithDetails extends PeopleGroupReport {
  people_group_name: string
  people_group_slug: string | null
}

class PeopleGroupReportService {
  private sql = getSql()

  async create(data: {
    people_group_id: number
    reporter_name: string
    reporter_email?: string | null
    suggested_changes: Record<string, any>
    notes?: string | null
  }): Promise<PeopleGroupReport> {
    const [row] = await this.sql`
      INSERT INTO people_group_reports (people_group_id, reporter_name, reporter_email, suggested_changes, notes)
      VALUES (
        ${data.people_group_id},
        ${data.reporter_name},
        ${data.reporter_email ?? null},
        ${this.sql.json(data.suggested_changes)},
        ${data.notes ?? null}
      )
      RETURNING *
    `
    return row as PeopleGroupReport
  }

  async getById(id: number): Promise<PeopleGroupReportWithDetails | null> {
    const [row] = await this.sql`
      SELECT r.*, pg.name as people_group_name, pg.slug as people_group_slug
      FROM people_group_reports r
      JOIN people_groups pg ON r.people_group_id = pg.id
      WHERE r.id = ${id}
    `
    return (row as PeopleGroupReportWithDetails) || null
  }

  async getAll(opts: {
    status?: string
    peopleGroupId?: number
    search?: string
    limit?: number
    offset?: number
  } = {}): Promise<PeopleGroupReportWithDetails[]> {
    const conditions = []
    if (opts.status) conditions.push(this.sql`r.status = ${opts.status}`)
    if (opts.peopleGroupId) conditions.push(this.sql`r.people_group_id = ${opts.peopleGroupId}`)
    if (opts.search) {
      const search = `%${opts.search}%`
      conditions.push(this.sql`(pg.name ILIKE ${search} OR r.reporter_name ILIKE ${search})`)
    }

    const where = conditions.length > 0
      ? this.sql`WHERE ${conditions.reduce((a, b) => this.sql`${a} AND ${b}`)}`
      : this.sql``

    if (opts.limit) {
      return await this.sql`
        SELECT r.*, pg.name as people_group_name, pg.slug as people_group_slug
        FROM people_group_reports r
        JOIN people_groups pg ON r.people_group_id = pg.id
        ${where}
        ORDER BY r.created_at DESC
        LIMIT ${opts.limit} OFFSET ${opts.offset || 0}
      `
    }

    return await this.sql`
      SELECT r.*, pg.name as people_group_name, pg.slug as people_group_slug
      FROM people_group_reports r
      JOIN people_groups pg ON r.people_group_id = pg.id
      ${where}
      ORDER BY r.created_at DESC
    `
  }

  async count(opts: {
    status?: string
    peopleGroupId?: number
    search?: string
  } = {}): Promise<number> {
    const conditions = []
    if (opts.status) conditions.push(this.sql`r.status = ${opts.status}`)
    if (opts.peopleGroupId) conditions.push(this.sql`r.people_group_id = ${opts.peopleGroupId}`)
    if (opts.search) {
      const search = `%${opts.search}%`
      conditions.push(this.sql`(pg.name ILIKE ${search} OR r.reporter_name ILIKE ${search})`)
    }

    const where = conditions.length > 0
      ? this.sql`WHERE ${conditions.reduce((a, b) => this.sql`${a} AND ${b}`)}`
      : this.sql``

    const [row] = await this.sql`
      SELECT COUNT(*) as count
      FROM people_group_reports r
      JOIN people_groups pg ON r.people_group_id = pg.id
      ${where}
    `
    return Number(row?.count ?? 0)
  }

  async updateStatus(
    id: number,
    status: 'pending' | 'accepted' | 'denied',
    reviewedBy: string,
    opts?: { notes?: string | null; previousValues?: Record<string, any> }
  ): Promise<PeopleGroupReport | null> {
    const [row] = await this.sql`
      UPDATE people_group_reports
      SET status = ${status},
          reviewed_by = ${reviewedBy}::uuid,
          reviewed_at = CURRENT_TIMESTAMP,
          notes = COALESCE(${opts?.notes ?? null}, notes),
          previous_values = COALESCE(${opts?.previousValues ? this.sql.json(opts.previousValues) : null}, previous_values),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    return (row as PeopleGroupReport) || null
  }

  async update(id: number, data: {
    suggested_changes?: Record<string, any>
    notes?: string | null
    reporter_name?: string
    reporter_email?: string | null
  }): Promise<PeopleGroupReport | null> {
    const current = await this.getById(id)
    if (!current) return null

    const [row] = await this.sql`
      UPDATE people_group_reports
      SET suggested_changes = ${data.suggested_changes !== undefined ? this.sql.json(data.suggested_changes) : this.sql.json(current.suggested_changes)},
          notes = ${data.notes !== undefined ? data.notes : current.notes},
          reporter_name = ${data.reporter_name ?? current.reporter_name},
          reporter_email = ${data.reporter_email !== undefined ? data.reporter_email : current.reporter_email},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    return (row as PeopleGroupReport) || null
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM people_group_reports WHERE id = ${id}
    `
    return result.count > 0
  }
}

export const peopleGroupReportService = new PeopleGroupReportService()
