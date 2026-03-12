import { Cron } from 'croner'
import { createDatabaseBackup } from '../utils/backup'

async function claimBackupLock(dateKey: string): Promise<boolean> {
  const lockKey = `backup-scheduler:${dateKey}`
  const [row] = await sql`
    INSERT INTO activity_logs (id, timestamp, event_type, metadata)
    VALUES (
      md5(${lockKey})::uuid,
      ${Date.now()},
      'BACKUP_SCHEDULER_LOCK',
      ${{ date: dateKey }}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  return !!row
}

/**
 * Nitro plugin to schedule automatic daily database backups at 2 AM UTC
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  // Only run scheduled backups in production or if explicitly enabled
  const enableScheduledBackups = process.env.ENABLE_SCHEDULED_BACKUPS === 'true'
  const isProduction = process.env.NODE_ENV === 'production'

  if (!enableScheduledBackups && !isProduction) {
    console.log('⏸️  Scheduled backups disabled in development mode')
    console.log('   Set ENABLE_SCHEDULED_BACKUPS=true to enable in development')
    return
  }

  console.log('📅 Scheduling automatic database backups (daily at 2 AM UTC)')

  const task = new Cron('0 2 * * *', { timezone: 'UTC' }, async () => {
    const dateKey = new Date().toISOString().split('T')[0]!
    if (!await claimBackupLock(dateKey)) return

    console.log('🔄 Starting scheduled database backup...')

    try {
      const result = await createDatabaseBackup()

      if (result.success) {
        console.log(`✅ Scheduled backup completed successfully`)
        console.log(`   File: ${result.filename}`)
        console.log(`   Size: ${(result.size! / 1024 / 1024).toFixed(2)} MB`)
        console.log(`   Location: ${result.s3Location}`)
      } else {
        console.error(`❌ Scheduled backup failed: ${result.error}`)
      }
    } catch (error: any) {
      console.error('❌ Scheduled backup error:', error.message)
    }
  })

  console.log('✅ Backup scheduler initialized')

  // Cleanup on server shutdown
  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping backup scheduler...')
    task.stop()
  })
})
