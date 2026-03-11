import { groupService } from '../../../database/groups'
import { connectionService } from '../../../database/connections'
import { peopleGroupAdoptionService } from '../../../database/people-group-adoptions'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')
  const group = await groupService.getById(id)

  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  const [subscribers, adoptions] = await Promise.all([
    connectionService.getSubscribersForGroup(id),
    peopleGroupAdoptionService.getForGroup(id)
  ])

  return { group, subscribers, adoptions }
})
