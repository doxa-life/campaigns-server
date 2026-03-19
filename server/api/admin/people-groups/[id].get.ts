import { peopleGroupService } from '../../../database/people-groups'
import { peopleGroupAdoptionService } from '../../../database/people-group-adoptions'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')

  const peopleGroup = await peopleGroupService.getPeopleGroupById(id)

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  const adoptions = await peopleGroupAdoptionService.getForPeopleGroup(id)

  return {
    peopleGroup: {
      ...peopleGroup,
      metadata: peopleGroup.metadata || {}
    },
    adoptions
  }
})
