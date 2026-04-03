import { updatePrayerStats } from '../../../utils/prayer-stats'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * API endpoint to manually trigger prayer stats update
 * Protected endpoint - requires admin authentication
 */
export default defineEventHandler(async (event) => {
  // Verify admin authentication
  await requireSuperAdmin(event)

  console.log('Manual prayer stats update triggered by admin')

  try {
    await updatePrayerStats()

    return {
      success: true,
      message: 'Prayer counts updated successfully'
    }
  } catch (error) {
    handleApiError(error, 'Failed to update prayer counts')
  }
})
