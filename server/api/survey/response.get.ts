import { surveyService } from '#server/database/surveys'
import { subscriberService } from '#server/database/subscribers'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_SURVEY_KEY = 'may-2026-survey'

export default defineEventHandler(async (event) => {
  const { id, key, lang } = getQuery(event)
  const surveyKey = typeof key === 'string' && key ? key : DEFAULT_SURVEY_KEY
  const language = typeof lang === 'string' && lang ? lang : 'en'
  const profileId = typeof id === 'string' ? id : ''

  const survey = await surveyService.getByKey(surveyKey)
  if (!survey) {
    return {
      valid: false,
      surveyExists: false,
      status: 'closed' as const,
      name: '',
      alreadyResponded: false,
      answers: {} as Record<string, number | string>,
      title: '',
      questions: [] as Array<{ key: string; type: string; config: Record<string, any> }>,
      content: {} as Record<string, any>
    }
  }

  const [questions, content] = await Promise.all([
    surveyService.getQuestions(survey.id),
    surveyService.getTranslation(survey.id, language)
  ])

  const base = {
    surveyExists: true,
    status: survey.status,
    title: survey.title,
    questions: questions.map(q => ({ key: q.key, type: q.type, config: q.config })),
    content
  }

  if (!UUID_REGEX.test(profileId)) {
    return { ...base, valid: false, name: '', alreadyResponded: false, answers: {} as Record<string, number | string> }
  }

  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber) {
    return { ...base, valid: false, name: '', alreadyResponded: false, answers: {} as Record<string, number | string> }
  }

  const existing = await surveyService.getResponseForSubscriber(survey.id, subscriber.id)

  return {
    ...base,
    valid: true,
    name: subscriber.name,
    alreadyResponded: !!existing,
    answers: existing?.answers ?? {}
  }
})
