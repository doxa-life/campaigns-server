import { Cron } from 'croner'
import { getReportSummaryPeriod, runReportMonthlySummary } from '../utils/app/report-summary'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  console.log('📬 Report summary scheduler initialized (1st of month at 7 AM UTC)')

  /**
   * Atomically claim the lock for a summarized month. Uses INSERT ... ON CONFLICT
   * on a deterministic UUID so only one instance sends across multiple processes.
   */
  async function claimLock(periodKey: string): Promise<boolean> {
    const lockKey = `report-summary:${periodKey}`
    const [row] = await sql`
      INSERT INTO activity_logs (id, timestamp, event_type, metadata)
      VALUES (
        md5(${lockKey})::uuid,
        ${Date.now()},
        'REPORT_SUMMARY_LOCK',
        ${{ period: periodKey }}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    return !!row
  }

  const task = new Cron('0 7 1 * *', { timezone: 'UTC' }, async () => {
    const now = new Date()
    const period = getReportSummaryPeriod(now)

    if (!await claimLock(period.key)) return

    try {
      const { summary, sentTo } = await runReportMonthlySummary(now)

      await logEvent({
        eventType: 'REPORT_SUMMARY_SENT',
        metadata: {
          period: period.key,
          recipientCount: sentTo.length,
          receivedCount: summary.receivedCount,
          approvedCount: summary.approvedCount,
          awaiting: Object.fromEntries(summary.approvers.map((a) => [a.id, a.awaitingCount]))
        }
      })
      console.log(`✅ Report summary for ${period.key} sent to ${sentTo.length} approvers`)
    } catch (error: any) {
      console.error('❌ Failed to send report summary:', error.message)
    }
  })

  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping report summary scheduler...')
    task.stop()
  })
})
