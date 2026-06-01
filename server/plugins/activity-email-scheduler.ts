import { Cron } from 'croner'
import { collectActivityStats, type ActivityStats } from '../utils/activity-email-stats'
import { sendActivityEmail } from '../utils/activity-email'
import { userService } from '#server/database/users'
import { notificationRecipientService } from '#server/database/notification-recipients'

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface PeriodRange {
  start: Date
  end: Date
}

function getPeriod(frequency: Frequency, now: Date): PeriodRange {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()

  switch (frequency) {
    case 'daily': {
      const end = new Date(Date.UTC(y, m, d))
      const start = new Date(end)
      start.setUTCDate(start.getUTCDate() - 1)
      return { start, end }
    }
    case 'weekly': {
      const end = new Date(Date.UTC(y, m, d))
      const start = new Date(end)
      start.setUTCDate(start.getUTCDate() - 7)
      return { start, end }
    }
    case 'monthly': {
      const end = new Date(Date.UTC(y, m, 1))
      const start = new Date(Date.UTC(y, m - 1, 1))
      return { start, end }
    }
    case 'yearly': {
      const end = new Date(Date.UTC(y, 0, 1))
      const start = new Date(Date.UTC(y - 1, 0, 1))
      return { start, end }
    }
  }
}

async function getPreviousStats(frequency: Frequency): Promise<ActivityStats | null> {
  const [row] = await sql`
    SELECT metadata FROM activity_logs
    WHERE event_type = 'ACTIVITY_EMAIL_SENT'
      AND metadata->>'frequency' = ${frequency}
      AND metadata->'stats' IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT 1
  `
  if (!row?.metadata?.stats) return null
  return row.metadata.stats as ActivityStats
}

export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  console.log('📊 Activity email scheduler initialized (daily at 7 AM UTC)')

  /**
   * Atomically claim the lock for a given frequency+date.
   * Uses INSERT ... ON CONFLICT on a deterministic UUID so only one instance
   * wins across multiple server processes.
   */
  async function claimLock(frequency: Frequency, dateKey: string): Promise<boolean> {
    const lockKey = `activity-email:${frequency}:${dateKey}`
    const [row] = await sql`
      INSERT INTO activity_logs (id, timestamp, event_type, metadata)
      VALUES (
        md5(${lockKey})::uuid,
        ${Date.now()},
        'ACTIVITY_EMAIL_LOCK',
        ${{ frequency, date: dateKey }}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    return !!row
  }

  async function sendForFrequency(frequency: Frequency, now: Date) {
    const dateKey = now.toISOString().split('T')[0]!
    if (!await claimLock(frequency, dateKey)) return

    try {
      const period = getPeriod(frequency, now)

      const [stats, previousStats] = await Promise.all([
        collectActivityStats(period.start, period.end),
        getPreviousStats(frequency)
      ])

      const statsRecipients = await notificationRecipientService.getByGroup('stats')
      const statsEmails = new Set(statsRecipients.map(r => r.email.toLowerCase()))

      const adminUsers = await userService.getAdminUsers()
      const defaultPrefs = { daily: true, weekly: true, monthly: true, yearly: true }

      const recipientEmails = adminUsers
        .filter(user => {
          if (!statsEmails.has(user.email.toLowerCase())) return false
          const prefs = user.activity_email_preferences ?? defaultPrefs
          return prefs[frequency] !== false
        })
        .map(user => user.email)

      console.log(`📧 Sending ${frequency} activity email to ${recipientEmails.length} users...`)

      let sent = 0
      for (const email of recipientEmails) {
        try {
          await sendActivityEmail(email, frequency, stats, previousStats)
          sent++
        } catch (error: any) {
          console.error(`❌ Failed to send ${frequency} activity email to ${email}:`, error.message)
        }
      }

      await logEvent({
        eventType: 'ACTIVITY_EMAIL_SENT',
        metadata: { frequency, recipientCount: sent, date: dateKey, stats }
      })
      console.log(`✅ ${frequency} activity email sent to ${sent}/${recipientEmails.length} users`)
    } catch (error: any) {
      console.error(`❌ Failed to process ${frequency} activity emails:`, error.message)
    }
  }

  const task = new Cron('0 7 * * *', { timezone: 'UTC' }, async () => {
    const now = new Date()

    await sendForFrequency('daily', now)

    // Monday = 1
    if (now.getUTCDay() === 1) {
      await sendForFrequency('weekly', now)
    }

    // 1st of month
    if (now.getUTCDate() === 1) {
      await sendForFrequency('monthly', now)
    }

    // Jan 1
    if (now.getUTCMonth() === 0 && now.getUTCDate() === 1) {
      await sendForFrequency('yearly', now)
    }
  })

  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping activity email scheduler...')
    task.stop()
  })
})
