import { surveyService, type SurveyAnswerInput } from '#server/database/surveys'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { MAY_2026_SURVEY_KEY, MAY_2026_SURVEY_QUESTIONS } from '#shared/surveys/may-2026-survey'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT_LENGTH = 5000

// Readable labels for the subscriber activity-log entry (admin-facing, English).
const ACTIVITY_LABELS: Record<string, string> = {
  focus: 'Focus & engagement (1-5)',
  experience: 'What made the prompts helpful',
  clarity: 'Clarity of prompts (1-5)',
  content_amount: 'Amount of content (1-5)',
  heart: 'Heart & perspective'
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const profileId = typeof body?.id === 'string' ? body.id : ''

  if (!UUID_REGEX.test(profileId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid survey link' })
  }

  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
  }

  const survey = await surveyService.getByKey(MAY_2026_SURVEY_KEY)
  if (!survey) {
    throw createError({ statusCode: 500, statusMessage: 'Survey not configured' })
  }
  if (survey.status !== 'open') {
    throw createError({ statusCode: 403, statusMessage: 'This survey is closed' })
  }

  const incoming: Record<string, unknown> = body?.answers && typeof body.answers === 'object' ? body.answers : {}
  const answers: SurveyAnswerInput[] = []
  const formValues: Record<string, number | string> = {}

  for (const question of MAY_2026_SURVEY_QUESTIONS) {
    const value = incoming[question.key]

    if (question.type === 'scale') {
      if (value === undefined || value === null || value === '') continue
      const num = Number(value)
      const min = question.min ?? 1
      const max = question.max ?? 5
      if (!Number.isInteger(num) || num < min || num > max) {
        throw createError({ statusCode: 400, statusMessage: `Invalid value for ${question.key}` })
      }
      answers.push({ question_key: question.key, value_int: num })
      formValues[ACTIVITY_LABELS[question.key] ?? question.key] = num
    } else {
      if (typeof value !== 'string') continue
      const text = value.trim().slice(0, MAX_TEXT_LENGTH)
      if (!text) continue
      answers.push({ question_key: question.key, value_text: text })
      formValues[ACTIVITY_LABELS[question.key] ?? question.key] = text
    }
  }

  const subscriptions = await peopleGroupSubscriptionService.getSubscriberSubscriptions(subscriber.id)
  const metadata = {
    preferred_language: subscriber.preferred_language,
    country: subscriber.country,
    people_group_ids: [...new Set(subscriptions.map(s => s.people_group_id))],
    people_group_names: [...new Set(subscriptions.map(s => s.people_group_name))]
  }

  const existing = await surveyService.getResponseForSubscriber(survey.id, subscriber.id)

  await surveyService.upsertResponse(survey.id, subscriber.id, profileId, answers, metadata)

  // Surface the response on the subscriber's activity log, like the contact form does.
  const logMeta = {
    badge: 'Survey Response',
    source: survey.title,
    message: existing ? 'Survey response updated' : 'Survey response submitted',
    form_values: formValues
  }
  if (existing) {
    logUpdate('subscribers', String(subscriber.id), event, logMeta)
  } else {
    logCreate('subscribers', String(subscriber.id), event, logMeta)
  }

  return { success: true }
})
