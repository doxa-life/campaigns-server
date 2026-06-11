import { defineEventHandler } from 'h3'
import { appConfigService } from '#server/database/app-config'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Get the mobile app version-gate configuration.
 *
 * Returns the latest released version, the minimum supported version, and the
 * iOS App Store numeric id. These drive the public GET /api/app/version endpoint.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.edit')

  try {
    const [latest, min, iosId] = await Promise.all([
      appConfigService.getConfig<string>('app_version_latest'),
      appConfigService.getConfig<string>('app_version_min'),
      appConfigService.getConfig<string>('app_ios_app_store_id')
    ])

    return {
      latest_version: latest,
      min_supported_version: min,
      ios_app_store_id: iosId
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch app version configuration')
  }
})
