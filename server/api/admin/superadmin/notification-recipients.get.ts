import { notificationRecipientService } from '../../../database/notification-recipients'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  try {
    const all = await notificationRecipientService.getAll()

    const grouped: Record<string, typeof all> = {}
    for (const r of all) {
      if (!grouped[r.group_key]) grouped[r.group_key] = []
      grouped[r.group_key]!.push(r)
    }

    return grouped
  } catch (error) {
    handleApiError(error, 'Failed to fetch notification recipients')
  }
})
