import { getSql } from './db'

export type ReportType = 'add' | 'update' | 'remove'
export type ReportSource = 'admin' | 'public'
// Lifecycle: admin-sourced reports go pending → accepted/denied (single
// reviewer, instant apply). Public reports go awaiting_verification → pending
// (email verified) → approved (both designated approvers) → accepted (applied)
// or denied (either approver, unilateral).
export type ReportStatus = 'awaiting_verification' | 'pending' | 'approved' | 'accepted' | 'denied'

export interface ReportApproval {
  user_id: string
  approved_at: string
}

export interface PeopleGroupReport {
  id: number
  // Null when the report is for a people group not yet in the system.
  people_group_id: number | null
  // Free-text name and identifier captured for an unlinked report.
  people_group_name: string | null
  people_group_uid: string | null
  type: ReportType
  source: ReportSource
  reporter_name: string
  reporter_email: string | null
  reporter_org: string | null
  verifier_name: string | null
  verifier_entity: string | null
  verifier_email: string | null
  reporter_contact_method_id: number | null
  suggested_changes: Record<string, any>
  suggested_image_key: string | null
  previous_values: Record<string, any> | null
  status: ReportStatus
  approvals: ReportApproval[]
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PeopleGroupReportWithDetails extends PeopleGroupReport {
  // Resolved display name: the linked group's name, falling back to the
  // reported free-text name for unlinked reports.
  people_group_name: string
  people_group_slug: string | null
}

class PeopleGroupReportService {
  private sql = getSql()

  async create(data: {
    people_group_id?: number | null
    people_group_name?: string | null
    people_group_uid?: string | null
    type?: ReportType
    source?: ReportSource
    status?: ReportStatus
    reporter_name: string
    reporter_email?: string | null
    reporter_org?: string | null
    verifier_name?: string | null
    verifier_entity?: string | null
    verifier_email?: string | null
    reporter_contact_method_id?: number | null
    suggested_changes: Record<string, any>
    suggested_image_key?: string | null
    notes?: string | null
  }): Promise<PeopleGroupReport> {
    const [row] = await this.sql`
      INSERT INTO people_group_reports (
        people_group_id, people_group_name, people_group_uid, type, source, status,
        reporter_name, reporter_email, reporter_org,
        verifier_name, verifier_entity, verifier_email,
        reporter_contact_method_id, suggested_changes, suggested_image_key, notes
      )
      VALUES (
        ${data.people_group_id ?? null},
        ${data.people_group_name ?? null},
        ${data.people_group_uid ?? null},
        ${data.type ?? 'update'},
        ${data.source ?? 'admin'},
        ${data.status ?? 'pending'},
        ${data.reporter_name},
        ${data.reporter_email ?? null},
        ${data.reporter_org ?? null},
        ${data.verifier_name ?? null},
        ${data.verifier_entity ?? null},
        ${data.verifier_email ?? null},
        ${data.reporter_contact_method_id ?? null},
        ${this.sql.json(data.suggested_changes)},
        ${data.suggested_image_key ?? null},
        ${data.notes ?? null}
      )
      RETURNING *
    `
    return row as PeopleGroupReport
  }

  async getById(id: number): Promise<PeopleGroupReportWithDetails | null> {
    const [row] = await this.sql`
      SELECT r.*, COALESCE(pg.name, r.people_group_name) as people_group_name, pg.slug as people_group_slug
      FROM people_group_reports r
      LEFT JOIN people_groups pg ON r.people_group_id = pg.id
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
      conditions.push(this.sql`(pg.name ILIKE ${search} OR r.people_group_name ILIKE ${search} OR r.reporter_name ILIKE ${search})`)
    }

    const where = conditions.length > 0
      ? this.sql`WHERE ${conditions.reduce((a, b) => this.sql`${a} AND ${b}`)}`
      : this.sql``

    if (opts.limit) {
      return await this.sql`
        SELECT r.*, COALESCE(pg.name, r.people_group_name) as people_group_name, pg.slug as people_group_slug
        FROM people_group_reports r
        LEFT JOIN people_groups pg ON r.people_group_id = pg.id
        ${where}
        ORDER BY r.created_at DESC
        LIMIT ${opts.limit} OFFSET ${opts.offset || 0}
      `
    }

    return await this.sql`
      SELECT r.*, COALESCE(pg.name, r.people_group_name) as people_group_name, pg.slug as people_group_slug
      FROM people_group_reports r
      LEFT JOIN people_groups pg ON r.people_group_id = pg.id
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
      conditions.push(this.sql`(pg.name ILIKE ${search} OR r.people_group_name ILIKE ${search} OR r.reporter_name ILIKE ${search})`)
    }

    const where = conditions.length > 0
      ? this.sql`WHERE ${conditions.reduce((a, b) => this.sql`${a} AND ${b}`)}`
      : this.sql``

    const [row] = await this.sql`
      SELECT COUNT(*) as count
      FROM people_group_reports r
      LEFT JOIN people_groups pg ON r.people_group_id = pg.id
      ${where}
    `
    return Number(row?.count ?? 0)
  }

  async updateStatus(
    id: number,
    status: ReportStatus,
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

  /**
   * Record one designated approver's approval on a pending public report.
   * Appends atomically (skipping if this user already approved) and flips the
   * status to 'approved' once two distinct approvers are on record.
   */
  async addApproval(id: number, userId: string): Promise<PeopleGroupReport | null> {
    const [row] = await this.sql`
      UPDATE people_group_reports
      SET approvals = approvals || ${this.sql.json([{ user_id: userId, approved_at: new Date().toISOString() }])},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
        AND status = 'pending'
        AND source = 'public'
        AND NOT (approvals @> ${this.sql.json([{ user_id: userId }])})
      RETURNING *
    `
    if (!row) return this.getById(id)

    const report = row as PeopleGroupReport
    const distinctApprovers = new Set(report.approvals.map((a) => a.user_id))
    if (distinctApprovers.size >= 2) {
      const [approved] = await this.sql`
        UPDATE people_group_reports
        SET status = 'approved', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND status = 'pending'
        RETURNING *
      `
      return (approved as PeopleGroupReport) || report
    }
    return report
  }

  /**
   * Move a verified reporter's held-back submissions into the review queue.
   * Returns the promoted reports so callers can notify the approvers.
   */
  async promoteAwaitingVerification(contactMethodId: number): Promise<PeopleGroupReport[]> {
    const rows = await this.sql`
      UPDATE people_group_reports
      SET status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE reporter_contact_method_id = ${contactMethodId}
        AND status = 'awaiting_verification'
      RETURNING *
    `
    return rows as unknown as PeopleGroupReport[]
  }

  // Attach an unlinked report to a real people group. Only succeeds while the
  // report has no people_group_id yet.
  async link(id: number, peopleGroupId: number): Promise<PeopleGroupReport | null> {
    const [row] = await this.sql`
      UPDATE people_group_reports
      SET people_group_id = ${peopleGroupId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id} AND people_group_id IS NULL
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
