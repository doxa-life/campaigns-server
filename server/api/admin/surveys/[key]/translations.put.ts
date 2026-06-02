import { surveyService, type SurveyTranslationContent } from '#server/database/surveys'
import { SUPPORTED_LANGUAGES } from '#server/utils/deepl'

// Upsert one language's translation blob (page text, question labels, email copy).
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
  const language = typeof body?.language === 'string' ? body.language : ''
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported language: ${language || '(empty)'}` })
  }
  if (!body?.content || typeof body.content !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'content object is required' })
  }

  await surveyService.upsertTranslation(survey.id, language, body.content as SurveyTranslationContent)

  logUpdate('surveys', String(survey.id), event, { changes: { translation: language } })

  return { success: true }
})
