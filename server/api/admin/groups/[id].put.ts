import { groupService } from '../../../database/groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')
  const body = await readBody<{
    name?: string
    primary_subscriber_id?: number | null
    country?: string | null
  }>(event)

  const updated = await groupService.update(id, {
    name: body.name?.trim(),
    primary_subscriber_id: body.primary_subscriber_id !== undefined ? (body.primary_subscriber_id || null) : undefined,
    country: body.country !== undefined ? (body.country?.trim() || null) : undefined
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  return { group: updated }
})
