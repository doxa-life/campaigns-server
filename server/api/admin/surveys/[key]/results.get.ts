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

  const results = await surveyService.getResults(survey.id)

  return {
    key: survey.key,
    title: survey.title,
    status: survey.status,
    ...results
  }
})
