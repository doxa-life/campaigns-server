import { surveyService, type SurveyAnswerInput } from '#server/database/surveys'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { MAY_2026_SURVEY_KEY, MAY_2026_SURVEY_QUESTIONS } from '#shared/surveys/may-2026-survey'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT_LENGTH = 5000

// Readable labels for the subscriber activity-log entry (admin-facing, English).
const ACTIVITY_LABELS: Record<string, string> = {
  frequency: 'Days per week using content (1-4)',
  focus: 'Helps me focus & engage (1-5)',
  experience: 'Most helpful part of the prayer page',
  clarity: 'Communicates what & why to pray (1-5)',
  balance: 'Scripture/prayer/reflection balance (1-5)',
  scripted_preference: 'Scripted vs strategic prayer preference (1-4)',
  new_pg_daily: 'Enjoys a new people group each day (1=Yes, 2=No)',
  background_info: 'Background info helpful (1=Yes, 2=No)',
  improvement: 'One thing to change, add, or remove'
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
    } else if (question.type === 'choice') {
      if (value === undefined || value === null || value === '') continue
      const num = Number(value)
      const options = question.options ?? []
      if (!Number.isInteger(num) || !options.includes(num)) {
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
