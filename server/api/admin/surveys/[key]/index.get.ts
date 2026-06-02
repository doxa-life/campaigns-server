import { surveyService } from '#server/database/surveys'

// Full survey payload for the admin builder: row + questions + every language blob.
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

  const [questions, translations] = await Promise.all([
    surveyService.getQuestions(survey.id),
    surveyService.getAllTranslations(survey.id)
  ])

  return { survey, questions, translations }
})
