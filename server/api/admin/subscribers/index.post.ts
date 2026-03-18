import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{
    name: string
    email?: string
    phone?: string
    role?: string
  }>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const { subscriber, isNew } = await subscriberService.findOrCreateSubscriber({
    name: body.name.trim(),
    email: body.email?.trim() || undefined,
    phone: body.phone?.trim() || undefined,
    role: body.role?.trim() || undefined
  })

  if (!isNew && body.role) {
    await subscriberService.updateSubscriber(subscriber.id, { role: body.role.trim() })
  }

  if (isNew) {
    logCreate('subscribers', String(subscriber.id), event)
  }

  return { subscriber, isNew }
})
