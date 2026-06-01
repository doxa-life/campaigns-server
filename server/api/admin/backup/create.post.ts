import { createDatabaseBackup } from '#server/utils/backup'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * API endpoint to manually trigger a database backup
 * Protected endpoint - requires admin authentication
 */
export default defineEventHandler(async (event) => {
  try {
    await requireSuperAdmin(event)

    console.log('Manual backup triggered by admin')

    // Create and upload backup
    const result = await createDatabaseBackup()

    if (!result.success) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Backup failed',
        message: result.error || 'Unknown error occurred during backup'
      })
    }

    return {
      message: 'Database backup completed successfully',
      backup: {
        filename: result.filename,
        size: result.size,
        location: result.s3Location
      }
    }
  } catch (error) {
    handleApiError(error, 'Backup failed')
  }
})
