import { groupService } from '../../../database/groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'groups.delete')

  const id = getIntParam(event, 'id')
  await doAction('record.delete', 'group', id)
  const deleted = await groupService.delete(id)

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  return { success: true }
})
