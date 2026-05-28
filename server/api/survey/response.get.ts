import { surveyService } from '#server/database/surveys'
import { subscriberService } from '#server/database/subscribers'
import { MAY_2026_SURVEY_KEY } from '#shared/surveys/may-2026-survey'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const empty = {
    valid: false,
    name: '',
    status: 'open' as 'open' | 'closed',
    alreadyResponded: false,
    answers: {} as Record<string, number | string>
  }

  const { id } = getQuery(event)
  const profileId = typeof id === 'string' ? id : ''

  if (!UUID_REGEX.test(profileId)) {
    return empty
  }

  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber) {
    return empty
  }

  const survey = await surveyService.getByKey(MAY_2026_SURVEY_KEY)
  if (!survey) {
    throw createError({ statusCode: 500, statusMessage: 'Survey not configured' })
  }

  const existing = await surveyService.getResponseForSubscriber(survey.id, subscriber.id)

  return {
    valid: true,
    name: subscriber.name,
    status: survey.status,
    alreadyResponded: !!existing,
    answers: existing?.answers ?? {}
  }
})
