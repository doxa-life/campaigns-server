import { surveyService } from '#server/database/surveys'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.view')

  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing survey key' })
  }

  const survey = await surveyService.getByKey(key)
  if (!survey) {
    throw createError({ statusCode: 404, statusMessage: 'Survey not found' })
  }

  const responses = await surveyService.listResponses(survey.id)

  return { responses }
})
