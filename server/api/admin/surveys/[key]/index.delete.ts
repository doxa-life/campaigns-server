import { surveyService } from '#server/database/surveys'

// Deletes the survey and (via ON DELETE CASCADE) its questions, translations,
// responses, and answers.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.delete')

  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing survey key' })
  }

  const survey = await surveyService.getByKey(key)
  if (!survey) {
    throw createError({ statusCode: 404, statusMessage: 'Survey not found' })
  }

  await surveyService.delete(survey.id)

  logDelete('surveys', String(survey.id), event)

  return { success: true }
})
