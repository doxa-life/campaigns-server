import { marketingSenderService } from '#server/database/marketing-senders'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)

  const body = await readBody(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  if (!body.local_part?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Email local part is required' })
  }

  try {
    const sender = await marketingSenderService.create({
      name: body.name.trim(),
      local_part: body.local_part.trim(),
      reply_to: body.reply_to?.trim() || null,
      is_default: !!body.is_default,
      created_by: user.userId
    })
    return { success: true, sender }
  } catch (error) {
    handleApiError(error, 'Failed to create sender', 400)
  }
})
