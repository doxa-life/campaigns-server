import { groupService } from '../../../database/groups'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'groups.create')

  const body = await readBody<{
    name: string
    primary_subscriber_id?: number | null
  }>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const group = await groupService.create({
    name: body.name.trim(),
    primary_subscriber_id: body.primary_subscriber_id || null
  })

  logCreate('groups', String(group.id), event)

  return { group }
})
