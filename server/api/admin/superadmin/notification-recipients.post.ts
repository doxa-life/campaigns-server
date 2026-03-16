import { notificationRecipientService } from '../../../database/notification-recipients'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{
    group_key: string
    email: string
    name?: string
  }>(event)

  if (!body.group_key || !body.email) {
    throw createError({ statusCode: 400, statusMessage: 'group_key and email are required' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  try {
    const recipient = await notificationRecipientService.add(
      body.group_key,
      body.email.trim().toLowerCase(),
      body.name?.trim()
    )
    return recipient
  } catch (error: any) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'This email is already in this notification group' })
    }
    handleApiError(error, 'Failed to add notification recipient')
  }
})
