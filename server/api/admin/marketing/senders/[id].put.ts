import { marketingSenderService } from '#server/database/marketing-senders'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid sender ID' })
  }

  const existing = await marketingSenderService.getById(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Sender not found' })
  }

  const body = await readBody(event)

  if (body.name !== undefined && !body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })
  }
  if (body.local_part !== undefined && !body.local_part?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Email local part cannot be empty' })
  }

  try {
    const sender = await marketingSenderService.update(id, {
      name: body.name?.trim(),
      local_part: body.local_part?.trim(),
      reply_to: body.reply_to !== undefined ? (body.reply_to?.trim() || null) : undefined,
      is_default: body.is_default
    })
    return { success: true, sender }
  } catch (error) {
    handleApiError(error, 'Failed to update sender', 400)
  }
})
