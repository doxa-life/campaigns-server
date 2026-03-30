import { getSql } from './db'

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
  private sql = getSql()

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

    const [row] = await this.sql`
      INSERT INTO jobs (type, reference_type, reference_id, payload, priority, scheduled_at, max_attempts)
      VALUES (
        ${type}, ${referenceType || null}, ${referenceId || null},
        ${this.sql.json(payload)}, ${priority},
        COALESCE(${scheduledAt?.toISOString() || null}, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        ${maxAttempts}
      )
      RETURNING *
    `
    return row as Job
  }

  async getById(id: number): Promise<Job | null> {
    const [row] = await this.sql`SELECT * FROM jobs WHERE id = ${id}`
    return (row as Job) || null
  }

  async getPendingJobs(type?: JobType, limit: number = 10): Promise<Job[]> {
    if (type) {
      return await this.sql`
        SELECT * FROM jobs
        WHERE status = 'pending'
          AND scheduled_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          AND type = ${type}
        ORDER BY priority DESC, scheduled_at ASC
        LIMIT ${limit}
      `
    }
    return await this.sql`
      SELECT * FROM jobs
      WHERE status = 'pending'
        AND scheduled_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      ORDER BY priority DESC, scheduled_at ASC
      LIMIT ${limit}
    `
  }

  async markProcessing(id: number): Promise<void> {
    await this.sql`
      UPDATE jobs
      SET status = 'processing',
          attempts = attempts + 1,
          last_attempt_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
  }

  async markCompleted(id: number, result?: Record<string, any>): Promise<void> {
    await this.sql`
      UPDATE jobs
      SET status = 'completed',
          result = ${result ? this.sql.json(result) : null},
          completed_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    await this.sql`
      UPDATE jobs
      SET status = 'failed',
          error_message = ${errorMessage},
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
  }

  async retryJob(id: number): Promise<boolean> {
    const result = await this.sql`
      UPDATE jobs
      SET status = 'pending',
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id} AND attempts < max_attempts
    `
    return result.count > 0
  }

  async getJobStats(referenceType?: string, referenceId?: number): Promise<JobStats> {
    let result
    if (referenceType && referenceId) {
      [result] = await this.sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'processing') as processing,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM jobs
        WHERE reference_type = ${referenceType} AND reference_id = ${referenceId}
      `
    } else {
      [result] = await this.sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'processing') as processing,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM jobs
      `
    }
    return {
      total: Number(result?.total),
      pending: Number(result?.pending),
      processing: Number(result?.processing),
      completed: Number(result?.completed),
      failed: Number(result?.failed)
    }
  }

  async getJobsByReference(referenceType: string, referenceId: number): Promise<Job[]> {
    return await this.sql`
      SELECT * FROM jobs
      WHERE reference_type = ${referenceType} AND reference_id = ${referenceId}
      ORDER BY created_at ASC
    `
  }

  async cancelPendingJobs(referenceType: string, referenceId: number): Promise<number> {
    const result = await this.sql`
      DELETE FROM jobs
      WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} AND status = 'pending'
    `
    return result.count
  }

  async deleteCompletedJobs(referenceType: string, referenceId: number): Promise<number> {
    const result = await this.sql`
      DELETE FROM jobs
      WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} AND status IN ('completed', 'failed')
    `
    return result.count
  }

  async hasActiveJobs(referenceType: string, referenceId: number): Promise<boolean> {
    const [row] = await this.sql`
      SELECT 1 FROM jobs
      WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} AND status IN ('pending', 'processing')
      LIMIT 1
    `
    return !!row
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
}

export const jobQueueService = new JobQueueService()
