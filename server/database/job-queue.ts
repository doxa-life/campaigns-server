import { getDatabase } from './db'

export type JobType = 'marketing_email' | 'translation_batch' | 'import'

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Job {
  id: number
  type: JobType
  reference_type: string | null
  reference_id: number | null
  payload: Record<string, any>
  status: JobStatus
  priority: number
  scheduled_at: string
  attempts: number
  max_attempts: number
  last_attempt_at: string | null
  error_message: string | null
  result: Record<string, any> | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateJobOptions {
  priority?: number
  scheduledAt?: Date
  maxAttempts?: number
  referenceType?: string
  referenceId?: number
}

export interface JobStats {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
}

export interface MarketingEmailPayload {
  marketing_email_id: number
  contact_method_id: number
  recipient_email: string
}

export interface TranslationBatchPayload {
  library_id: number
  source_language: string
  target_language: string
  overwrite: boolean
  retranslate_verses: boolean
}

class JobQueueService {
  private db = getDatabase()

  async createJob<T extends Record<string, any>>(
    type: JobType,
    payload: T,
    options: CreateJobOptions = {}
  ): Promise<Job> {
    const {
      priority = 0,
      scheduledAt,
      maxAttempts = 3,
      referenceType,
      referenceId
    } = options

    const stmt = this.db.prepare(`
      INSERT INTO jobs (type, reference_type, reference_id, payload, priority, scheduled_at, max_attempts)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), ?)
    `)

    const result = await stmt.run(
      type,
      referenceType || null,
      referenceId || null,
      payload,
      priority,
      scheduledAt?.toISOString() || null,
      maxAttempts
    )

    return (await this.getById(result.lastInsertRowid as number))!
  }

  async getById(id: number): Promise<Job | null> {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?')
    const row = await stmt.get(id)
    return row ? this.parseJob(row) : null
  }

  async getPendingJobs(type?: JobType, limit: number = 10): Promise<Job[]> {
    let query = `
      SELECT * FROM jobs
      WHERE status = 'pending'
        AND scheduled_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    `
    const params: any[] = []

    if (type) {
      query += ' AND type = ?'
      params.push(type)
    }

    query += ' ORDER BY priority DESC, scheduled_at ASC LIMIT ?'
    params.push(limit)

    const stmt = this.db.prepare(query)
    const rows = await stmt.all(...params)
    return rows.map((row: any) => this.parseJob(row))
  }

  async markProcessing(id: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE jobs
      SET status = 'processing',
          attempts = attempts + 1,
          last_attempt_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(id)
  }

  async markCompleted(id: number, result?: Record<string, any>): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE jobs
      SET status = 'completed',
          result = ?,
          completed_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(result || null, id)
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE jobs
      SET status = 'failed',
          error_message = ?,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(errorMessage, id)
  }

  async retryJob(id: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      UPDATE jobs
      SET status = 'pending',
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ? AND attempts < max_attempts
    `)
    const result = await stmt.run(id)
    return result.changes > 0
  }

  async getJobStats(referenceType?: string, referenceId?: number): Promise<JobStats> {
    let query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM jobs
    `
    const params: any[] = []

    if (referenceType && referenceId) {
      query += ' WHERE reference_type = ? AND reference_id = ?'
      params.push(referenceType, referenceId)
    }

    const stmt = this.db.prepare(query)
    const result = await stmt.get(...params)
    return {
      total: Number(result.total),
      pending: Number(result.pending),
      processing: Number(result.processing),
      completed: Number(result.completed),
      failed: Number(result.failed)
    }
  }

  async getJobsByReference(referenceType: string, referenceId: number): Promise<Job[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs
      WHERE reference_type = ? AND reference_id = ?
      ORDER BY created_at ASC
    `)
    const rows = await stmt.all(referenceType, referenceId)
    return rows.map((row: any) => this.parseJob(row))
  }

  async cancelPendingJobs(referenceType: string, referenceId: number): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM jobs
      WHERE reference_type = ? AND reference_id = ? AND status = 'pending'
    `)
    const result = await stmt.run(referenceType, referenceId)
    return result.changes
  }

  async deleteCompletedJobs(referenceType: string, referenceId: number): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM jobs
      WHERE reference_type = ? AND reference_id = ? AND status IN ('completed', 'failed')
    `)
    const result = await stmt.run(referenceType, referenceId)
    return result.changes
  }

  async hasActiveJobs(referenceType: string, referenceId: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT 1 FROM jobs
      WHERE reference_type = ? AND reference_id = ? AND status IN ('pending', 'processing')
      LIMIT 1
    `)
    const result = await stmt.get(referenceType, referenceId)
    return !!result
  }

  async isComplete(referenceType: string, referenceId: number): Promise<boolean> {
    return !(await this.hasActiveJobs(referenceType, referenceId))
  }

  async createMarketingEmailJobs(
    marketingEmailId: number,
    recipients: Array<{ id: number; value: string }>
  ): Promise<number> {
    if (recipients.length === 0) return 0

    let count = 0
    for (const recipient of recipients) {
      const payload: MarketingEmailPayload = {
        marketing_email_id: marketingEmailId,
        contact_method_id: recipient.id,
        recipient_email: recipient.value
      }
      await this.createJob('marketing_email', payload, {
        referenceType: 'marketing_email',
        referenceId: marketingEmailId
      })
      count++
    }
    return count
  }

  private parseJob(row: any): Job {
    return {
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : null
    }
  }
}

export const jobQueueService = new JobQueueService()
