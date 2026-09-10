import { jobQueueService } from '../../database/job-queue'
import { processOutboundEmail } from '../../jobs/processors/outbound-email'
import { processInboxEmail } from '../../jobs/processors/inbox-email'
import { getRecordedInboxEmails } from '../../utils/inbox-email'

/**
 * VITEST-ONLY. The job-processor plugin disables its background poll under VITEST, so tests
 * use this to run the outbound-email processor (or, with `type: 'inbox_email'`, the staff
 * notification processor) synchronously and assert on the emails that inboxEmailService
 * records (instead of sending) under VITEST. Scoped to a single conversation's jobs so tests
 * stay isolated from each other's queue backlog. Returns 404 in any non-test environment.
 */
export default defineEventHandler(async (event) => {
  if (!process.env.VITEST) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody(event).catch(() => ({}))
  const conversationId = Number(body?.conversation_id)
  if (!conversationId) throw createError({ statusCode: 400, statusMessage: 'conversation_id required' })
  const type = body?.type === 'inbox_email' ? 'inbox_email' : 'outbound_email'

  // Claim only this conversation's pending jobs of that type (mirrors claimJobs' atomic flip).
  const jobs = await sql`
    UPDATE jobs
    SET status = 'processing', attempts = attempts + 1,
        last_attempt_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE type = ${type} AND reference_id = ${conversationId} AND status = 'pending'
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `

  let processed = 0
  for (const job of jobs as any[]) {
    processed++
    try {
      const result = type === 'inbox_email' ? await processInboxEmail(job) : await processOutboundEmail(job)
      if (result.success) await jobQueueService.markCompleted(job.id, result.data)
      else throw new Error(result.data?.error || 'Job failed')
    } catch (err: any) {
      await jobQueueService.failOrRetry(job.id, err?.message || 'Job failed')
    }
  }

  return { processed, emails: getRecordedInboxEmails() }
})
