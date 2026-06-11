import { jobQueueService } from '../database/job-queue'
import { marketingEmailService } from '../database/marketing-emails'
import { getProcessor } from '../jobs/processors'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  const enableJobProcessor = process.env.ENABLE_JOB_PROCESSOR !== 'false'

  if (!enableJobProcessor) {
    console.log('Job processor disabled')
    console.log('   Set ENABLE_JOB_PROCESSOR=true to enable')
    return
  }

  console.log('Job processor started (checking every 30 seconds)')

  let processingStartedAt = 0

  const drainQueue = async () => {
    if (processingStartedAt > 0 && Date.now() - processingStartedAt < 5 * 60 * 1000) return
    try {
      processingStartedAt = Date.now()
      const hadWork = await processJobQueue()
      // If there's more work, schedule the next cycle sooner (1s) so translation
      // progress is visible in the UI between jobs
      if (hadWork) {
        setTimeout(drainQueue, 1000)
      }
    } catch (error: any) {
      console.error('Job processor error:', error.message)
    } finally {
      processingStartedAt = 0
    }
  }

  const interval = setInterval(drainQueue, 30 * 1000)

  setTimeout(drainQueue, 15000)

  // Reaper: return jobs stranded in 'processing' by a crashed/redeployed instance
  // back to the queue. Threshold must comfortably exceed the longest a single job
  // can legitimately take, so a slow-but-live job is never reclaimed (which would
  // double-send). 15 min is well past the 5 min drain-cycle assumption above.
  const staleTimeoutMinutes = Number(process.env.JOB_STALE_TIMEOUT_MINUTES) || 15
  const reapStaleJobs = async () => {
    try {
      const { requeued, failed } = await jobQueueService.reapStaleJobs(staleTimeoutMinutes)
      if (requeued || failed) {
        console.log(`Reaped stale jobs: ${requeued} requeued, ${failed} failed`)
      }
    } catch (error: any) {
      console.error('Job reaper error:', error.message)
    }
  }
  const reapInterval = setInterval(reapStaleJobs, 60 * 1000)

  console.log('Job processor initialized')

  nitroApp.hooks.hook('close', () => {
    console.log('Stopping job processor...')
    clearInterval(interval)
    clearInterval(reapInterval)
  })
})

async function processJobQueue(): Promise<boolean> {
  // Process translation jobs one at a time so the progress UI can update between jobs.
  // Other job types (marketing emails) are batched for throughput.
  const translationJob = await jobQueueService.claimJobs('translation_batch', 1)

  if (translationJob.length > 0) {
    const job = translationJob[0]!
    console.log(`Processing translation job ${job.id}...`)
    try {
      const processor = getProcessor(job.type)
      const result = await processor(job)

      if (result.success) {
        await jobQueueService.markCompleted(job.id, result.data)
      } else {
        throw new Error(result.data?.error || 'Job failed')
      }
    } catch (error: any) {
      console.error(`Translation job ${job.id} failed:`, error.message || error)
      await jobQueueService.failOrRetry(job.id, error.message || 'Unknown error')
    }
    return true
  }

  // Process other job types in batches
  const batchSize = 10
  const pending = await jobQueueService.claimJobs(undefined, batchSize)

  if (pending.length === 0) return false

  console.log(`Processing ${pending.length} job(s)...`)

  const marketingEmailIds = new Set<number>()

  for (const job of pending) {
    try {
      const processor = getProcessor(job.type)
      const result = await processor(job)

      if (result.success) {
        await jobQueueService.markCompleted(job.id, result.data)
      } else {
        throw new Error(result.data?.error || 'Job failed')
      }

      if (job.type === 'marketing_email' && job.reference_id) {
        marketingEmailIds.add(job.reference_id)
      }
    } catch (error: any) {
      await jobQueueService.failOrRetry(job.id, error.message || 'Unknown error')

      if (job.type === 'marketing_email' && job.reference_id) {
        marketingEmailIds.add(job.reference_id)
      }
    }
  }

  for (const emailId of marketingEmailIds) {
    const isComplete = await jobQueueService.isComplete('marketing_email', emailId)
    if (!isComplete) continue
    // Only finalize emails still mid-send — never resurrect one that was cancelled
    // (or already finalized) into sent/failed.
    const email = await marketingEmailService.getById(emailId)
    if (!email || (email.status !== 'queued' && email.status !== 'sending')) continue
    // Overwrite the live +1 counters with drift-free totals derived from job terminal
    // states (a recipient that failed then succeeded on retry would otherwise be counted
    // in both sent and failed). `sent` excludes skipped recipients (suppressed /
    // unsubscribed / already-sent), so a campaign where everyone was skipped reports 'failed'.
    const counts = await jobQueueService.getMarketingSendCounts(emailId)
    await marketingEmailService.updateStats(emailId, email.recipient_count, counts.sent, counts.failed)
    const finalStatus = counts.sent > 0 ? 'sent' : 'failed'
    await marketingEmailService.updateStatus(emailId, finalStatus)
    console.log(`  Marketing email ${emailId} complete: ${counts.sent} sent, ${counts.failed} failed, ${counts.skipped} skipped`)
  }

  console.log('Job processing complete')
  return true
}
