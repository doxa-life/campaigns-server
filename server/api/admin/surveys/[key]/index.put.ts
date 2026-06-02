import { surveyService } from '#server/database/surveys'

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
  const update: { title?: string; status?: 'open' | 'closed' } = {}

  if (typeof body?.title === 'string') {
    const title = body.title.trim()
    if (!title) throw createError({ statusCode: 400, statusMessage: 'Title cannot be empty' })
    update.title = title
  }
  if (body?.status === 'open' || body?.status === 'closed') {
    update.status = body.status
  }

  const updated = await surveyService.update(survey.id, update)

  logUpdate('surveys', String(survey.id), event, { changes: update })

  return { success: true, survey: updated }
})
