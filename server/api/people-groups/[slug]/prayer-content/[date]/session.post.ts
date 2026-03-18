/**
 * POST /api/people-groups/:slug/prayer-content/:date/session
 * Record a prayer session for analytics and tracking
 */
import { peopleGroupService } from '#server/database/people-groups'
import { getSql } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const dateParam = getRouterParam(event, 'date')
  const body = await readBody(event)

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'People group slug is required'
    })
  }

  if (!dateParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Date is required'
    })
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateParam)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid date format. Expected YYYY-MM-DD'
    })
  }

  // Validate request body
  const { sessionId, trackingId, duration, timestamp, peopleGroupId } = body

  // Use peopleGroupId if provided (faster), otherwise lookup by slug
  let peopleGroup
  if (peopleGroupId) {
    peopleGroup = await peopleGroupService.getPeopleGroupById(peopleGroupId)
  } else {
    peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)
  }

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  if (!sessionId || duration === undefined || !timestamp) {
    throw createError({
      statusCode: 400,
      statusMessage: 'sessionId, duration, and timestamp are required'
    })
  }

  const sql = getSql()

  try {
    // Upsert: Insert or update based on session_id
    await sql`
      INSERT INTO prayer_activity (people_group_id, session_id, tracking_id, duration, timestamp, content_date)
      VALUES (${peopleGroup.id}, ${sessionId}, ${trackingId || null}, ${duration}, ${timestamp}, ${dateParam})
      ON CONFLICT (session_id) WHERE session_id IS NOT NULL
      DO UPDATE SET duration = EXCLUDED.duration, timestamp = EXCLUDED.timestamp, content_date = EXCLUDED.content_date
    `

    return {
      message: 'Prayer session recorded'
    }
  } catch (error) {
    handleApiError(error, 'Failed to record prayer session')
  }
})
