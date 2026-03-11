import { peopleGroupAdoptionService } from '../../../database/people-group-adoptions'
import { adoptionReportService } from '../../../database/adoption-reports'

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

  const body = await readBody<{
    praying_count?: number
    stories?: string
    comments?: string
  }>(event)

  const report = await adoptionReportService.create({
    adoption_id: adoption.id,
    praying_count: body.praying_count ?? null,
    stories: body.stories?.trim() || null,
    comments: body.comments?.trim() || null
  })

  return { report }
})
