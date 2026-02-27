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

  console.log('Job processor initialized')

  nitroApp.hooks.hook('close', () => {
    console.log('Stopping job processor...')
    clearInterval(interval)
  })
})

async function processJobQueue(): Promise<boolean> {
  // Process translation jobs one at a time so the progress UI can update between jobs.
  // Other job types (marketing emails) are batched for throughput.
  const translationJob = await jobQueueService.getPendingJobs('translation_batch', 1)

  if (translationJob.length > 0) {
    const job = translationJob[0]!
    console.log(`Processing translation job ${job.id}...`)
    try {
      await jobQueueService.markProcessing(job.id)
      const processor = getProcessor(job.type)
      const result = await processor(job)

      if (result.success) {
        await jobQueueService.markCompleted(job.id, result.data)
      } else {
        throw new Error(result.data?.error || 'Job failed')
      }
    } catch (error: any) {
      console.error(`Translation job ${job.id} failed:`, error.message || error)
      const canRetry = job.attempts < job.max_attempts
      await jobQueueService.markFailed(job.id, error.message || 'Unknown error')
      if (canRetry) {
        await jobQueueService.retryJob(job.id)
      }
    }
    return true
  }

  // Process other job types in batches
  const batchSize = 10
  const pending = await jobQueueService.getPendingJobs(undefined, batchSize)

  if (pending.length === 0) return false

  console.log(`Processing ${pending.length} job(s)...`)

  const marketingEmailIds = new Set<number>()

  for (const job of pending) {
    try {
      await jobQueueService.markProcessing(job.id)

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
      const canRetry = job.attempts < job.max_attempts
      await jobQueueService.markFailed(job.id, error.message || 'Unknown error')

      if (canRetry) {
        await jobQueueService.retryJob(job.id)
      }

      if (job.type === 'marketing_email' && job.reference_id) {
        marketingEmailIds.add(job.reference_id)
      }
    }
  }

  for (const emailId of marketingEmailIds) {
    const isComplete = await jobQueueService.isComplete('marketing_email', emailId)
    if (isComplete) {
      const stats = await jobQueueService.getJobStats('marketing_email', emailId)
      const finalStatus = stats.failed > 0 && stats.completed === 0 ? 'failed' : 'sent'
      await marketingEmailService.updateStatus(emailId, finalStatus)
      console.log(`  Marketing email ${emailId} complete: ${stats.completed} sent, ${stats.failed} failed`)
    }
  }

  console.log('Job processing complete')
  return true
}
