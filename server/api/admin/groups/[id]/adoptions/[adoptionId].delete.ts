import { peopleGroupAdoptionService } from '../../../../../database/people-group-adoptions'
import { peopleGroupService } from '../../../../../database/people-groups'
import { groupService } from '../../../../../database/groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const groupId = getIntParam(event, 'id')
  const adoptionId = getIntParam(event, 'adoptionId')

  const adoption = await peopleGroupAdoptionService.getById(adoptionId)
  if (!adoption || adoption.group_id !== groupId) {
    throw createError({ statusCode: 404, statusMessage: 'Adoption not found' })
  }

  const [group, peopleGroup] = await Promise.all([
    groupService.getById(groupId),
    peopleGroupService.getPeopleGroupById(adoption.people_group_id)
  ])

  await peopleGroupAdoptionService.delete(adoptionId)
  logUpdate('groups', String(groupId), event, { adoption_removed: peopleGroup?.name || adoption.people_group_id })
  logUpdate('people_groups', String(adoption.people_group_id), event, { adoption_removed: group?.name || groupId })

  return { success: true }
})
