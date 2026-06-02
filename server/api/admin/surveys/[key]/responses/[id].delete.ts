import { surveyService } from '#server/database/surveys'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.send')

  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing survey key' })
  }

  const id = getIntParam(event, 'id')

  const survey = await surveyService.getByKey(key)
  if (!survey) {
    throw createError({ statusCode: 404, statusMessage: 'Survey not found' })
  }

  const deleted = await surveyService.deleteResponse(survey.id, id)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Response not found' })
  }

  logDelete('survey_responses', String(id), event, { surveyKey: key })

  return { success: true }
})
