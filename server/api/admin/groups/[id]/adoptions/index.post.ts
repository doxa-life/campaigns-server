import { peopleGroupAdoptionService } from '../../../../../database/people-group-adoptions'
import { peopleGroupService } from '../../../../../database/people-groups'
import { groupService } from '../../../../../database/groups'
import { getIntParam } from '#server/utils/api-helpers'

const VALID_STATUSES = ['pending', 'active', 'inactive'] as const

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const groupId = getIntParam(event, 'id')
  const body = await readBody<{
    people_group_id: number
    status?: 'pending' | 'active' | 'inactive'
    show_publicly?: boolean
  }>(event)

  if (!body.people_group_id) {
    throw createError({ statusCode: 400, statusMessage: 'people_group_id is required' })
  }

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` })
  }

  const [group, peopleGroup] = await Promise.all([
    groupService.getById(groupId),
    peopleGroupService.getPeopleGroupById(body.people_group_id)
  ])
  if (!group) throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  if (!peopleGroup) throw createError({ statusCode: 404, statusMessage: 'People group not found' })

  try {
    const adoption = await peopleGroupAdoptionService.create({
      people_group_id: body.people_group_id,
      group_id: groupId,
      status: body.status,
      show_publicly: body.show_publicly
    })
    logCreate('groups', String(groupId), event, { adoption_added: peopleGroup.name })
    logCreate('people_groups', String(body.people_group_id), event, { adoption_added: group.name })
    return { adoption }
  } catch (error: any) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'This people group is already adopted by this group' })
    }
    throw error
  }
})
