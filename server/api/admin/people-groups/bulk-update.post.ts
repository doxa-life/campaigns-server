import { peopleGroupService, UpdatePeopleGroupData } from '../../../database/people-groups'
import { getSql } from '#server/database/db'
import { handleApiError, getErrorMessage } from '#server/utils/api-helpers'

const CONCURRENCY_LIMIT = 10
const MAX_ERRORS = 50

interface BulkUpdateItem {
  id?: number | null
  slug?: string
  name?: string
  image_url?: string | null
  joshua_project_id?: string | null
  metadata?: Record<string, any>
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

interface BulkUpdateBody {
  updates: BulkUpdateItem[]
}

interface BulkUpdateError {
  index: number
  identifier: string
  message: string
}

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)

    const body = await readBody<BulkUpdateBody>(event)

    if (!body?.updates || !Array.isArray(body.updates)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Request body must contain an "updates" array'
      })
    }

    if (body.updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Updates array must not be empty'
      })
    }

    if (body.updates.length > 500) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Updates array must not exceed 500 items'
      })
    }

    // Validate each item has a valid id (number) or slug (string)
    for (let i = 0; i < body.updates.length; i++) {
      const item = body.updates[i]!
      const hasValidId = typeof item.id === 'number' && item.id > 0
      const hasValidSlug = typeof item.slug === 'string' && item.slug.length > 0
      if (!hasValidId && !hasValidSlug) {
        throw createError({
          statusCode: 400,
          statusMessage: `Item at index ${i} must have either "id" (positive number) or "slug" (non-empty string)`
        })
      }
    }

    // Batch resolve slugs to ids
    const slugsToResolve = body.updates
      .filter(item => item.slug && typeof item.id !== 'number')
      .map(item => item.slug!)

    const slugToIdMap = new Map<string, number>()

    if (slugsToResolve.length > 0) {
      const uniqueSlugs = [...new Set(slugsToResolve)]
      const sql = getSql()
      const rows = await sql`SELECT id, slug FROM people_groups WHERE slug IN ${sql(uniqueSlugs)}` as { id: number; slug: string }[]
      for (const row of rows) {
        slugToIdMap.set(row.slug, row.id)
      }
    }

    // Prepare work items
    interface WorkItem {
      index: number
      identifier: string
      resolvedId: number
      updateData: UpdatePeopleGroupData
    }

    const workItems: WorkItem[] = []
    let notFound = 0
    let skipped = 0
    const errors: BulkUpdateError[] = []

    for (let i = 0; i < body.updates.length; i++) {
      const item = body.updates[i]!
      const hasValidId = typeof item.id === 'number' && item.id > 0
      const identifier = hasValidId ? `id:${item.id}` : `slug:${item.slug}`

      // Resolve the id
      let resolvedId: number | undefined
      if (hasValidId) {
        resolvedId = item.id as number
      } else if (item.slug) {
        resolvedId = slugToIdMap.get(item.slug)
      }

      if (resolvedId === undefined) {
        notFound++
        if (errors.length < MAX_ERRORS) {
          errors.push({ index: i, identifier, message: 'Not found' })
        }
        continue
      }

      // Build update data (matches [id].put.ts field mapping)
      const updateData: UpdatePeopleGroupData = {}
      let hasFields = false

      if (item.name !== undefined) { updateData.name = item.name; hasFields = true }
      if (item.image_url !== undefined) { updateData.image_url = item.image_url; hasFields = true }
      if (item.joshua_project_id !== undefined) { updateData.joshua_project_id = item.joshua_project_id; hasFields = true }
      if (item.metadata !== undefined) { updateData.metadata = item.metadata; hasFields = true }
      if (item.country_code !== undefined) { updateData.country_code = item.country_code; hasFields = true }
      if (item.region !== undefined) { updateData.region = item.region; hasFields = true }
      if (item.latitude !== undefined) { updateData.latitude = item.latitude; hasFields = true }
      if (item.longitude !== undefined) { updateData.longitude = item.longitude; hasFields = true }
      if (item.population !== undefined) { updateData.population = item.population; hasFields = true }
      if (item.evangelical_pct !== undefined) { updateData.evangelical_pct = item.evangelical_pct; hasFields = true }
      if (item.engagement_status !== undefined) { updateData.engagement_status = item.engagement_status; hasFields = true }
      if (item.primary_religion !== undefined) { updateData.primary_religion = item.primary_religion; hasFields = true }
      if (item.primary_language !== undefined) { updateData.primary_language = item.primary_language; hasFields = true }
      if (item.descriptions !== undefined) { updateData.descriptions = item.descriptions; hasFields = true }

      if (!hasFields) {
        skipped++
        continue
      }

      workItems.push({ index: i, identifier, resolvedId, updateData })
    }

    // Process updates in concurrent chunks
    let updated = 0
    let errorCount = 0

    for (let c = 0; c < workItems.length; c += CONCURRENCY_LIMIT) {
      const chunk = workItems.slice(c, c + CONCURRENCY_LIMIT)
      const results = await Promise.allSettled(
        chunk.map(async (work) => {
          const result = await peopleGroupService.updatePeopleGroup(work.resolvedId, work.updateData)
          return { work, result }
        })
      )

      for (const settled of results) {
        if (settled.status === 'fulfilled') {
          if (settled.value.result) {
            updated++
          } else {
            notFound++
            if (errors.length < MAX_ERRORS) {
              errors.push({ index: settled.value.work.index, identifier: settled.value.work.identifier, message: 'Not found' })
            }
          }
        } else {
          errorCount++
          const work = chunk[results.indexOf(settled)]!
          if (errors.length < MAX_ERRORS) {
            errors.push({ index: work.index, identifier: work.identifier, message: getErrorMessage(settled.reason) })
          }
        }
      }
    }

    const total = body.updates.length
    const success = errorCount === 0

    return {
      success,
      message: `Bulk update: ${updated} updated, ${notFound} not found, ${skipped} skipped, ${errorCount} errors`,
      stats: { total, updated, notFound, skipped, errors: errorCount },
      errors
    }
  } catch (error) {
    handleApiError(error, 'Failed to bulk update people groups')
  }
})
