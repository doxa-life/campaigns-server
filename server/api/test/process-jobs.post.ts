import { jobQueueService } from '../../database/job-queue'
import { processOutboundEmail } from '../../jobs/processors/outbound-email'
import { getRecordedInboxEmails } from '../../utils/inbox-email'

/**
 * VITEST-ONLY. The job-processor plugin disables its background poll under VITEST, so tests
 * use this to run the outbound-email processor synchronously and assert on the emails that
 * inboxEmailService records (instead of sending) under VITEST. Scoped to a single
 * conversation's `outbound_email` jobs so tests stay isolated from each other's queue
 * backlog. Returns 404 in any non-test environment.
 */
export default defineEventHandler(async (event) => {
  if (!process.env.VITEST) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody(event).catch(() => ({}))
  const conversationId = Number(body?.conversation_id)
  if (!conversationId) throw createError({ statusCode: 400, statusMessage: 'conversation_id required' })

  // Claim only this conversation's pending outbound jobs (mirrors claimJobs' atomic flip).
  const jobs = await sql`
    UPDATE jobs
    SET status = 'processing', attempts = attempts + 1,
        last_attempt_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE type = 'outbound_email' AND reference_id = ${conversationId} AND status = 'pending'
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `

  let processed = 0
  for (const job of jobs as any[]) {
    processed++
    try {
      const result = await processOutboundEmail(job)
      if (result.success) await jobQueueService.markCompleted(job.id, result.data)
      else throw new Error(result.data?.error || 'Job failed')
    } catch (err: any) {
      await jobQueueService.failOrRetry(job.id, err?.message || 'Job failed')
    }
  }

  return { processed, emails: getRecordedInboxEmails() }
})
