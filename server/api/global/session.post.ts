/**
 * POST /api/global/session
 *
 * Records a completed prayer from the global.doxa.life app into prayer_activity
 * and forwards a `prayer_logged` event to Statinator, tagged source: 'global'
 * so global-origin prayers are distinguishable in the unified stats.
 *
 * Authenticated with the shared FORM_API_KEY.
 */
import { getSql } from '#server/database/db'
import { requireFormApiKey } from '#server/utils/form-api-key'
import { peopleGroupService } from '#server/database/people-groups'
import { trackEventInBackground } from '#server/utils/tracking'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody(event)
  const {
    session_id: sessionId,
    tracking_id: trackingId,
    people_group_id: peopleGroupId,
    duration,
    timestamp,
    language
  } = body

  if (!sessionId || !peopleGroupId || duration === undefined || !timestamp) {
    throw createError({
      statusCode: 400,
      statusMessage: 'session_id, people_group_id, duration, and timestamp are required'
    })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupById(peopleGroupId)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const sql = getSql()
  const contentDate = String(timestamp).slice(0, 10)

  try {
    await sql`
      INSERT INTO prayer_activity (people_group_id, session_id, tracking_id, duration, timestamp, content_date)
      VALUES (${peopleGroup.id}, ${sessionId}, ${trackingId || null}, ${duration}, ${timestamp}, ${contentDate})
      ON CONFLICT (session_id) WHERE session_id IS NOT NULL
      DO UPDATE SET duration = EXCLUDED.duration, timestamp = EXCLUDED.timestamp, content_date = EXCLUDED.content_date
    `

    trackEventInBackground(event, {
      eventType: 'prayer_logged',
      value: typeof duration === 'number' ? duration : null,
      anonymousHash: trackingId || null,
      language: typeof language === 'string' ? language.slice(0, 32) : null,
      url: null,
      targetLatitude: peopleGroup.latitude,
      targetLongitude: peopleGroup.longitude,
      metadata: {
        people_group_slug: peopleGroup.slug,
        source: 'global'
      }
    })

    return { message: 'Prayer recorded' }
  } catch (error) {
    handleApiError(error, 'Failed to record prayer')
  }
})
