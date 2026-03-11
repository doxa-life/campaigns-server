import { peopleGroupAdoptionService } from '../../../../../database/people-group-adoptions'
import { getIntParam } from '#server/utils/api-helpers'

const VALID_STATUSES = ['pending', 'active', 'inactive'] as const

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const groupId = getIntParam(event, 'id')
  const adoptionId = getIntParam(event, 'adoptionId')

  const adoption = await peopleGroupAdoptionService.getById(adoptionId)
  if (!adoption || adoption.group_id !== groupId) {
    throw createError({ statusCode: 404, statusMessage: 'Adoption not found' })
  }

  const body = await readBody<{
    status?: 'pending' | 'active' | 'inactive'
    show_publicly?: boolean
  }>(event)

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` })
  }

  const updated = await peopleGroupAdoptionService.update(adoptionId, {
    status: body.status,
    show_publicly: body.show_publicly
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Adoption not found' })
  }

  return { adoption: updated }
})
