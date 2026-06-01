import { defineEventHandler, createError } from 'h3'
import { appConfigService } from '#server/database/app-config'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Get global people group library configuration
 * This returns which libraries are available to all people groups and the global start date
 *
 * Structure:
 * {
 *   rows: [
 *     { rowIndex: 1, libraries: [{ libraryId: 1, order: 1 }, { libraryId: 2, order: 2 }] },
 *     { rowIndex: 2, libraries: [{ libraryId: 3, order: 1 }] }
 *   ],
 *   globalStartDate: "2025-01-01"
 * }
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.edit')

  try {
    const config = await appConfigService.getConfig('global_campaign_libraries')
    const startDate = await appConfigService.getConfig<string>('global_campaign_start_date')

    return {
      config: {
        rows: config?.rows || [],
        globalStartDate: startDate
      }
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch global people group library configuration')
  }
})
