import { Cron } from 'croner'
import { churchService } from '../database/churches'
import { drainChurchGeocodeQueue } from '../utils/app/church-geocoder'

/**
 * Nitro plugin that geocodes churches left pending (imports, restarts mid-drain,
 * Nominatim outages) once a minute. Each drain is bounded, so a tick finishes
 * before the next one fires.
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  const task = new Cron('* * * * *', { timezone: 'UTC' }, async () => {
    try {
      if (!await churchService.hasPendingGeocode()) return
      await drainChurchGeocodeQueue()
    } catch (error) {
      console.error('❌ Church geocode scheduler error:', error)
    }
  })

  nitroApp.hooks.hook('close', () => {
    task.stop()
  })
})
