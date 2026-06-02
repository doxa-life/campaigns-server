import { surveyService, type SurveyQuestionInput } from '#server/database/surveys'

const KEY_REGEX = /^[a-z][a-z0-9_]*$/
const VALID_TYPES = ['scale', 'text'] as const

// Replaces the survey's full question set (positions follow array order).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.edit')

  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing survey key' })
  }

  const survey = await surveyService.getByKey(key)
  if (!survey) {
    throw createError({ statusCode: 404, statusMessage: 'Survey not found' })
  }

  const body = await readBody(event)
  const incoming = Array.isArray(body?.questions) ? body.questions : null
  if (!incoming) {
    throw createError({ statusCode: 400, statusMessage: 'questions array is required' })
  }

  const seen = new Set<string>()
  const questions: SurveyQuestionInput[] = []

  for (const q of incoming) {
    const qKey = typeof q?.key === 'string' ? q.key.trim() : ''
    if (!KEY_REGEX.test(qKey)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid question key: ${qKey || '(empty)'}` })
    }
    if (seen.has(qKey)) {
      throw createError({ statusCode: 400, statusMessage: `Duplicate question key: ${qKey}` })
    }
    seen.add(qKey)

    if (!VALID_TYPES.includes(q?.type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid type for ${qKey}` })
    }

    if (q.type === 'scale') {
      const min = Number(q?.config?.min ?? 1)
      const max = Number(q?.config?.max ?? 5)
      if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) {
        throw createError({ statusCode: 400, statusMessage: `Invalid scale range for ${qKey}` })
      }
      const rawPoints = Array.isArray(q?.config?.scalePoints) ? q.config.scalePoints : []
      const scalePoints = rawPoints
        .map((p: unknown) => Number(p))
        .filter((p: number) => Number.isInteger(p) && p >= min && p <= max)
      questions.push({ key: qKey, type: 'scale', config: { min, max, scalePoints } })
    } else {
      questions.push({ key: qKey, type: 'text', config: {} })
    }
  }

  await surveyService.upsertQuestions(survey.id, questions)

  logUpdate('surveys', String(survey.id), event, { changes: { questions: questions.length } })

  return { success: true, questions: await surveyService.getQuestions(survey.id) }
})
