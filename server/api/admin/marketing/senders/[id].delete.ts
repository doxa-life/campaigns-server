import { marketingSenderService } from '#server/database/marketing-senders'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.send')

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid sender ID' })
  }

  const ok = await marketingSenderService.deactivate(id)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Sender not found' })
  }

  return { success: true }
})
