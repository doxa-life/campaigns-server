import type { Sql, TransactionSql } from 'postgres'
import { getSql } from './db'

export type JobType = 'marketing_email' | 'translation_batch' | 'import' | 'outbound_email' | 'inbox_email'

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

export interface OutboundEmailPayload {
  message_id: number
}

/**
 * Durable inbox side-emails (auto-ack, staff notifications). Routed through the queue
 * instead of fire-and-forget so a transient send failure is retried, not silently lost.
 */
export interface InboxEmailPayload {
  kind: 'auto_ack' | 'new_conversation' | 'assignee' | 'held_sender'
  conversation_id?: number
  message_id?: number
  to?: string // recipient for auto_ack / held_sender
  name?: string | null // auto_ack contact name
  language?: string | null // auto_ack language (captured from the form)
  held?: boolean // new_conversation: render the "needs review" variant
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

  /**
   * Atomically claim a batch of pending jobs for this instance.
   *
   * The app runs on multiple instances, each polling the queue concurrently.
   * Selecting and flipping the rows to 'processing' in a single statement —
   * with FOR UPDATE SKIP LOCKED on the inner select — guarantees two instances
   * can never claim the same row, so each job is processed (and its email sent)
   * exactly once. Returns the claimed rows, already in 'processing' status with
   * attempts incremented.
   */
  async claimJobs(type?: JobType, limit: number = 10): Promise<Job[]> {
    const typeFilter = type ? this.sql`AND type = ${type}` : this.sql``
    return await this.sql`
      UPDATE jobs
      SET status = 'processing',
          attempts = attempts + 1,
          last_attempt_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status = 'pending'
          AND scheduled_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          ${typeFilter}
        ORDER BY priority DESC, scheduled_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
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

  /**
   * Recover jobs stranded in 'processing' by an instance that crashed or was
   * redeployed mid-batch. claimJobs only ever selects 'pending', so without this
   * sweep a stranded row is never re-claimed and its parent (e.g. a marketing
   * email) stays wedged in 'sending' forever. Rows past the timeout go back to
   * 'pending' for re-claim while attempts remain, or to 'failed' once exhausted.
   * Keyed off last_attempt_at, which claimJobs stamps on every claim. Idempotent
   * and safe to run concurrently across instances.
   */
  async reapStaleJobs(timeoutMinutes: number): Promise<{ requeued: number; failed: number }> {
    const requeued = await this.sql`
      UPDATE jobs
      SET status = 'pending',
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE status = 'processing'
        AND attempts < max_attempts
        AND last_attempt_at < CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - make_interval(mins => ${timeoutMinutes})
    `
    const failed = await this.sql`
      UPDATE jobs
      SET status = 'failed',
          error_message = COALESCE(error_message, 'Stalled in processing past max attempts'),
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE status = 'processing'
        AND attempts >= max_attempts
        AND last_attempt_at < CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - make_interval(mins => ${timeoutMinutes})
    `
    return { requeued: requeued.count, failed: failed.count }
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
    recipients: Array<{ id: number; value: string }>,
    tx?: Sql | TransactionSql<{}>
  ): Promise<number> {
    if (recipients.length === 0) return 0

    const db = tx ?? this.sql
    let count = 0
    for (const recipient of recipients) {
      const payload: MarketingEmailPayload = {
        marketing_email_id: marketingEmailId,
        contact_method_id: recipient.id,
        recipient_email: recipient.value
      }
      // ON CONFLICT DO NOTHING backstops the atomic draft claim in send.post.ts: even
      // if the same recipient appears twice (e.g. duplicate addresses in a hand-picked
      // list) or a second send slips through, the partial unique index
      // uq_jobs_marketing_recipient guarantees one job per recipient per campaign.
      const inserted = await db`
        INSERT INTO jobs (type, reference_type, reference_id, payload, priority, scheduled_at, max_attempts)
        VALUES (
          'marketing_email', 'marketing_email', ${marketingEmailId},
          ${db.json(payload as Record<string, any>)}, 0,
          CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 3
        )
        ON CONFLICT (reference_id, (lower(payload->>'recipient_email'))) WHERE type = 'marketing_email'
        DO NOTHING
        RETURNING id
      `
      if (inserted.length > 0) count++
    }
    return count
  }
}

export const jobQueueService = new JobQueueService()
