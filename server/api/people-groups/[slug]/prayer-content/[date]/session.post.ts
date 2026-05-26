/**
 * POST /api/people-groups/:slug/prayer-content/:date/session
 * Record a prayer session for analytics and tracking
 */
import { peopleGroupService } from '#server/database/people-groups'
import { getSql } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'
import { trackEventInBackground } from '#server/utils/tracking'

// When the client sets `body.trackEvent` to one of these values, the session
// save also fires the corresponding event to Statinator via the server-side
// forwarder (`trackEventInBackground`). The browser builds no Statinator
// payload itself — only the string flag and the language.
const ALLOWED_TRACK_EVENTS = new Set(['prayer_auto_tracked', 'prayer_logged'])

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

    // Optional Statinator forward. The browser sets `trackEvent` only on saves
    // that should fire an event (the 30s checkpoint and the explicit
    // mark-as-prayed) — every other auto-save just upserts the row.
    if (typeof body.trackEvent === 'string' && ALLOWED_TRACK_EVENTS.has(body.trackEvent)) {
      const source = body.trackEvent === 'prayer_logged' ? 'explicit' : 'auto'
      trackEventInBackground(event, {
        eventType: body.trackEvent,
        value: typeof duration === 'number' ? duration : null,
        anonymousHash: trackingId || null,
        language: typeof body.language === 'string' ? body.language.slice(0, 32) : null,
        metadata: {
          people_group_slug: slug,
          content_date: dateParam,
          source
        }
      })
    }

    return {
      message: 'Prayer session recorded'
    }
  } catch (error) {
    handleApiError(error, 'Failed to record prayer session')
  }
})
