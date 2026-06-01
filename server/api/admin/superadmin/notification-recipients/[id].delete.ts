import { notificationRecipientService } from '../../../../database/notification-recipients'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getIntParam(event, 'id')

  try {
    const deleted = await notificationRecipientService.remove(id)
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'Recipient not found' })
    }
    return { success: true }
  } catch (error) {
    handleApiError(error, 'Failed to remove notification recipient')
  }
})
