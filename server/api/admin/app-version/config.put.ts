import { defineEventHandler, createError, readBody } from 'h3'
import { appConfigService } from '#server/database/app-config'
import { handleApiError } from '#server/utils/api-helpers'

const SEMVER = /^\d+\.\d+\.\d+$/

/**
 * Update the mobile app version-gate configuration.
 *
 * Expected body (all optional — only provided keys are updated):
 * {
 *   latest_version: "1.1.0",
 *   min_supported_version: "1.0.0",
 *   ios_app_store_id: "1234567890"
 * }
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.edit')

  try {
    const body = await readBody(event)

    for (const key of ['latest_version', 'min_supported_version'] as const) {
      if (body[key] !== undefined && !SEMVER.test(String(body[key]))) {
        throw createError({
          statusCode: 400,
          statusMessage: `${key} must be a semantic version (major.minor.patch)`
        })
      }
    }

    if (body.latest_version !== undefined) {
      await appConfigService.setConfig('app_version_latest', body.latest_version)
    }
    if (body.min_supported_version !== undefined) {
      await appConfigService.setConfig('app_version_min', body.min_supported_version)
    }
    if (body.ios_app_store_id !== undefined) {
      await appConfigService.setConfig('app_ios_app_store_id', String(body.ios_app_store_id))
    }

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
    handleApiError(error, 'Failed to update app version configuration')
  }
})
