import { peopleGroupService } from '#server/database/people-groups'
import { handleApiError } from '#server/utils/api-helpers'
import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const body = await readBody(event) as {
    name?: string
    peid?: string
    description?: string | null
    country_code?: string | null
    region?: string | null
    primary_religion?: string | null
    primary_language?: string | null
    latitude?: number | null
    longitude?: number | null
    population?: number | null
    engagement_status?: string | null
    status?: string | null
    image_url?: string | null
    metadata?: Record<string, any> | null
    tags?: string[]
    source?: string
  }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }
  if (!body.peid || typeof body.peid !== 'string' || !body.peid.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'peid is required' })
  }

  const sql = getSql()
  const peid = body.peid.trim()

  const existing = await sql`
    SELECT id FROM people_groups
    WHERE metadata->>'imb_peid' = ${peid}
    LIMIT 1
  `
  if (existing.length > 0) {
    throw createError({ statusCode: 409, statusMessage: `People group with PEID ${peid} already exists` })
  }

  try {
    const slug = await peopleGroupService.generateUniqueSlug(body.name)
    const metadata = { ...(body.metadata || {}), imb_peid: peid }
    const descriptions = body.description ? { en: body.description } : null

    const created = await peopleGroupService.createPeopleGroup({
      name: body.name.trim(),
      slug,
      image_url: body.image_url ?? null,
      metadata,
      descriptions,
      tags: body.tags,
      country_code: body.country_code ?? null,
      region: body.region ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      population: body.population ?? null,
      status: body.status ?? 'active',
      engagement_status: body.engagement_status ?? 'unengaged',
      primary_religion: body.primary_religion ?? null,
      primary_language: body.primary_language ?? null,
    })

    logCreate('people_groups', String(created.id), event, {
      source: body.source || 'IMB Import',
      imb_peid: peid,
    })

    return { peopleGroup: created }
  } catch (error: any) {
    handleApiError(error, 'Failed to create people group', 400)
  }
})
