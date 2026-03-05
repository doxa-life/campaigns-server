import { peopleGroupService, UpdatePeopleGroupData } from '../../../database/people-groups'
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
  engagement_status?: string | null
  primary_religion?: string | null
  primary_language?: string | null
  descriptions?: Record<string, string> | null
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getIntParam(event, 'id')

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
    updateData.metadata = JSON.stringify(body.metadata)
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

  return {
    peopleGroup: {
      ...updated,
      metadata: updated.metadata ? JSON.parse(updated.metadata) : {},
      descriptions: updated.descriptions ? (typeof updated.descriptions === 'string' ? JSON.parse(updated.descriptions) : updated.descriptions) : {}
    }
  }
})
