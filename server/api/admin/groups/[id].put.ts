import { groupService } from '../../../database/groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')

  const oldRecord = await groupService.getById(id)
  if (!oldRecord) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

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

  const changes: Record<string, { from: any; to: any }> = {}
  if (body.name !== undefined && body.name.trim() !== oldRecord.name) {
    changes.name = { from: oldRecord.name, to: body.name.trim() }
  }
  if (body.primary_subscriber_id !== undefined && (body.primary_subscriber_id || null) !== oldRecord.primary_subscriber_id) {
    changes.primary_subscriber_id = { from: oldRecord.primary_subscriber_id, to: body.primary_subscriber_id || null }
  }
  if (body.country !== undefined && (body.country?.trim() || null) !== oldRecord.country) {
    changes.country = { from: oldRecord.country, to: body.country?.trim() || null }
  }
  if (Object.keys(changes).length > 0) {
    logUpdate('groups', String(id), event, { changes })
  }

  return { group: updated }
})
