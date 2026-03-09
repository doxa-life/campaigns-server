import { Cron } from 'croner'
import { collectActivityStats, type ActivityStats } from '../utils/activity-email-stats'
import { sendActivityEmail } from '../utils/activity-email'
import { userService } from '#server/database/users'

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

  async function alreadySent(frequency: Frequency, dateKey: string): Promise<boolean> {
    const [existing] = await sql`
      SELECT 1 FROM activity_logs
      WHERE event_type = 'ACTIVITY_EMAIL_SENT'
        AND metadata->>'frequency' = ${frequency}
        AND metadata->>'date' = ${dateKey}
      LIMIT 1
    `
    return !!existing
  }

  async function sendForFrequency(frequency: Frequency, now: Date) {
    const dateKey = now.toISOString().split('T')[0]!
    if (await alreadySent(frequency, dateKey)) return

    try {
      const period = getPeriod(frequency, now)

      const [stats, previousStats] = await Promise.all([
        collectActivityStats(period.start, period.end),
        getPreviousStats(frequency)
      ])

      const users = await userService.getAdminUsers()
      const defaultPrefs = { daily: true, weekly: true, monthly: true, yearly: true }

      const recipients = users.filter(user => {
        const prefs = user.activity_email_preferences ?? defaultPrefs
        return prefs[frequency] !== false
      })

      console.log(`📧 Sending ${frequency} activity email to ${recipients.length} users...`)

      let sent = 0
      for (const user of recipients) {
        try {
          await sendActivityEmail(user.email, frequency, stats, previousStats)
          sent++
        } catch (error: any) {
          console.error(`❌ Failed to send ${frequency} activity email to ${user.email}:`, error.message)
        }
      }

      await logEvent({
        eventType: 'ACTIVITY_EMAIL_SENT',
        metadata: { frequency, recipientCount: sent, date: dateKey, stats }
      })
      console.log(`✅ ${frequency} activity email sent to ${sent}/${recipients.length} users`)
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
