import { peopleGroupService, type UpdatePeopleGroupData } from '../../../database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'

interface UpdateBody {
  name?: string
  image_url?: string | null
  joshua_project_id?: string | null
  metadata?: Record<string, any>
  // Normalized columns
  country_code?: string | null
  region?: string | null
  latitude?: number | null
  longitude?: number | null
  population?: number | null
  evangelical_pct?: number | null
  status?: string | null
  engagement_status?: string | null
  primary_religion?: string | null
  primary_language?: string | null
  descriptions?: Record<string, string> | null
}

const TRACKED_FIELDS = [
  'name', 'image_url', 'joshua_project_id', 'descriptions',
  'status', 'country_code', 'region', 'latitude', 'longitude',
  'population', 'evangelical_pct', 'engagement_status',
  'primary_religion', 'primary_language'
] as const

const TRACKED_FIELD_SET = new Set<string>(TRACKED_FIELDS)

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const id = getIntParam(event, 'id')

  const oldRecord = await peopleGroupService.getPeopleGroupById(id)
  if (!oldRecord) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const body = await readBody<UpdateBody>(event)

  // Build update data
  const updateData: UpdatePeopleGroupData = {}

  if (body.name !== undefined) {
    updateData.name = body.name
  }

  if (body.image_url !== undefined) {
    updateData.image_url = body.image_url
  }

  if (body.joshua_project_id !== undefined) {
    updateData.joshua_project_id = body.joshua_project_id || null
  }

  if (body.metadata !== undefined) {
    updateData.metadata = body.metadata
  }

  // Handle normalized columns
  if (body.country_code !== undefined) {
    updateData.country_code = body.country_code
  }

  if (body.region !== undefined) {
    updateData.region = body.region
  }

  if (body.latitude !== undefined) {
    updateData.latitude = body.latitude
  }

  if (body.longitude !== undefined) {
    updateData.longitude = body.longitude
  }

  if (body.population !== undefined) {
    updateData.population = body.population
  }

  if (body.evangelical_pct !== undefined) {
    updateData.evangelical_pct = body.evangelical_pct
  }

  if (body.status !== undefined) {
    updateData.status = body.status
  }

  if (body.engagement_status !== undefined) {
    updateData.engagement_status = body.engagement_status
  }

  if (body.primary_religion !== undefined) {
    updateData.primary_religion = body.primary_religion
  }

  if (body.primary_language !== undefined) {
    updateData.primary_language = body.primary_language
  }

  if (body.descriptions !== undefined) {
    updateData.descriptions = body.descriptions
  }

  const updated = await peopleGroupService.updatePeopleGroup(id, updateData)

  if (!updated) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Track field-level changes
  const changes: Record<string, { from: any; to: any }> = {}
  for (const field of TRACKED_FIELDS) {
    if (body[field] !== undefined && String(body[field] ?? '') !== String((oldRecord as any)[field] ?? '')) {
      changes[field] = { from: (oldRecord as any)[field], to: body[field] }
    }
  }
  if (body.metadata !== undefined) {
    const oldMeta: Record<string, any> = oldRecord.metadata || {}
    const newMeta = body.metadata || {}
    const allKeys = new Set([...Object.keys(oldMeta), ...Object.keys(newMeta)])
    for (const key of allKeys) {
      if (TRACKED_FIELD_SET.has(key)) continue
      if (String(oldMeta[key] ?? '') !== String(newMeta[key] ?? '')) {
        changes[key] = { from: oldMeta[key] ?? null, to: newMeta[key] ?? null }
      }
    }
  }
  if (body.descriptions !== undefined) {
    const oldDescs: Record<string, string> = oldRecord.descriptions || {}
    const newDescs = body.descriptions || {}
    const descKeys = new Set([...Object.keys(oldDescs), ...Object.keys(newDescs)])
    for (const lang of descKeys) {
      if ((oldDescs[lang] ?? '') !== (newDescs[lang] ?? '')) {
        changes[`description_${lang}`] = { from: oldDescs[lang] ?? null, to: newDescs[lang] ?? null }
      }
    }
  }
  if (Object.keys(changes).length > 0) {
    logUpdate('people_groups', String(id), event, { changes })
  }

  return {
    peopleGroup: {
      ...updated,
      metadata: updated.metadata || {},
      descriptions: updated.descriptions || {}
    }
  }
})
