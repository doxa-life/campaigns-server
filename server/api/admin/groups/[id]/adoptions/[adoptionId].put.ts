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

  const changes: Record<string, { from: any; to: any }> = {}
  if (body.status !== undefined && body.status !== adoption.status) {
    changes.status = { from: adoption.status, to: body.status }
  }
  if (body.show_publicly !== undefined && body.show_publicly !== adoption.show_publicly) {
    changes.show_publicly = { from: adoption.show_publicly, to: body.show_publicly }
  }
  if (Object.keys(changes).length > 0) {
    logUpdate('people_group_adoptions', String(adoptionId), event, { changes })
  }

  return { adoption: updated }
})
