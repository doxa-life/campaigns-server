/**
 * GET /api/app/version
 * Public endpoint used by the mobile app to decide whether to prompt for an update.
 *
 * Returns the latest released version, the minimum supported version (below which
 * the app must force an update), and the store URLs for each platform. All values
 * are editable at runtime via the app_config table (see admin/app-version), so
 * rollouts don't require a backend deploy.
 */
import { appConfigService } from '../../database/app-config'
import { setCacheHeaders } from '../../utils/app/cors'

const ANDROID_APPLICATION_ID = 'app.prayer.doxa'

// Sensible defaults so the endpoint never 500s when config is unset.
const DEFAULTS = {
  latest_version: '1.0.0',
  min_supported_version: '1.0.0',
  ios_app_store_id: '' // numeric App Store ID, e.g. "1234567890"
}

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const [latest, min, iosId] = await Promise.all([
    appConfigService.getConfig<string>('app_version_latest'),
    appConfigService.getConfig<string>('app_version_min'),
    appConfigService.getConfig<string>('app_ios_app_store_id')
  ])

  const iosAppStoreId = iosId ?? DEFAULTS.ios_app_store_id

  return {
    latest_version: latest ?? DEFAULTS.latest_version,
    min_supported_version: min ?? DEFAULTS.min_supported_version,
    ios_app_store_url: iosAppStoreId
      ? `https://apps.apple.com/app/id${iosAppStoreId}`
      : null,
    android_play_url: `https://play.google.com/store/apps/details?id=${ANDROID_APPLICATION_ID}`
  }
})
