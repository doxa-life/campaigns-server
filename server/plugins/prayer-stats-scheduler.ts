import { Cron } from 'croner'
import { updatePrayerStats } from '../utils/prayer-stats'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  console.log('📅 Scheduling prayer stats updates (daily at 3 AM UTC)')

  // Run once on startup to ensure stats are populated
  setTimeout(async () => {
    console.log('🔄 Running initial prayer stats update...')
    try {
      await updatePrayerStats()
      console.log('✅ Initial prayer stats update completed')
    } catch (error: any) {
      console.error('❌ Initial prayer stats update failed:', error.message)
    }
  }, 5000)

  const task = new Cron('0 3 * * *', { timezone: 'UTC' }, async () => {
    console.log('🔄 Starting scheduled prayer stats update...')

    try {
      await updatePrayerStats()
      console.log('✅ Scheduled prayer stats update completed')
    } catch (error: any) {
      console.error('❌ Scheduled prayer stats update failed:', error.message)
    }
  })

  console.log('✅ Prayer stats scheduler initialized')

  // Cleanup on server shutdown
  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping prayer stats scheduler...')
    task.stop()
  })
})
