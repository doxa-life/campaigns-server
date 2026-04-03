import { defineEventHandler, createError, readBody } from 'h3'
import { appConfigService } from '#server/database/app-config'
import { handleApiError } from '#server/utils/api-helpers'

interface LibraryConfig {
  libraryId: number
  order: number
}

interface RowConfig {
  rowIndex: number
  libraries: LibraryConfig[]
}

/**
 * Update global people group library configuration
 * This sets which libraries are available to all people groups and the global start date
 *
 * Expected body:
 * {
 *   rows: [
 *     { rowIndex: 1, libraries: [{ libraryId: 1, order: 1 }, { libraryId: 2, order: 2 }] },
 *     { rowIndex: 2, libraries: [{ libraryId: 3, order: 1 }] }
 *   ],
 *   global_start_date: "2025-01-01"
 * }
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.edit')

  try {
    const body = await readBody(event)

    if (!body.rows || !Array.isArray(body.rows)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'rows must be an array'
      })
    }

    if (!body.global_start_date) {
      throw createError({
        statusCode: 400,
        statusMessage: 'global_start_date is required'
      })
    }

    // Validate and normalize row structure
    const rows: RowConfig[] = body.rows.map((row: any, index: number) => ({
      rowIndex: row.rowIndex ?? index + 1,
      libraries: (row.libraries || []).map((lib: any, libIndex: number) => ({
        libraryId: lib.libraryId,
        order: lib.order ?? libIndex + 1
      }))
    }))

    // Create config object
    const config = { rows }

    // Save library configuration
    await appConfigService.setConfig('global_campaign_libraries', config)

    // Save global start date
    await appConfigService.setConfig('global_campaign_start_date', body.global_start_date)

    return {
      config: {
        ...config,
        globalStartDate: body.global_start_date
      }
    }
  } catch (error) {
    handleApiError(error, 'Failed to update global people group library configuration')
  }
})
