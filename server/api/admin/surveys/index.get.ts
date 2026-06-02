import { surveyService } from '#server/database/surveys'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.view')

  const surveys = await surveyService.listWithResponseCounts()

  return { surveys }
})
