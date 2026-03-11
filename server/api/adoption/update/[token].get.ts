import { peopleGroupAdoptionService } from '../../../database/people-group-adoptions'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token || !UUID_RE.test(token)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid token' })
  }

  const adoption = await peopleGroupAdoptionService.getByToken(token)

  if (!adoption) {
    throw createError({ statusCode: 404, statusMessage: 'Adoption not found' })
  }

  return {
    adoption: {
      id: adoption.id,
      people_group_name: adoption.people_group_name,
      people_group_slug: adoption.people_group_slug,
      group_name: adoption.group_name,
      status: adoption.status,
      adopted_at: adoption.adopted_at
    }
  }
})
