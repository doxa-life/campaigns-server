import { surveyService } from '#server/database/surveys'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'subscribers.view')

  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing survey key' })
  }

  const survey = await surveyService.getByKey(key)
  if (!survey) {
    throw createError({ statusCode: 404, statusMessage: 'Survey not found' })
  }

  const [results, questions, enContent] = await Promise.all([
    surveyService.getResults(survey.id),
    surveyService.getQuestions(survey.id),
    surveyService.getTranslation(survey.id, 'en')
  ])

  // Question order + English labels so the results page can render dynamically
  // (the survey definition no longer lives in code).
  const questionsOut = questions.map((q) => {
    const min = q.config?.min ?? 1
    const max = q.config?.max ?? 5
    return {
      key: q.key,
      type: q.type,
      label: enContent.questions?.[q.key]?.label ?? q.key,
      scalePoints: q.type === 'scale'
        ? Array.from({ length: max - min + 1 }, (_, i) => min + i)
        : []
    }
  })

  return {
    key: survey.key,
    title: survey.title,
    status: survey.status,
    questions: questionsOut,
    ...results
  }
})

