import { surveyService } from '#server/database/surveys'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'survey'
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.create')

  const body = await readBody(event)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }

  // Derive a unique, stable key from the requested key (or the title).
  const base = slugify(typeof body?.key === 'string' && body.key ? body.key : title)
  let key = base
  let n = 2
  while (await surveyService.getByKey(key)) {
    key = `${base}-${n++}`
  }

  const status = body?.status === 'closed' ? 'closed' : 'open'
  const survey = await surveyService.create({ key, title, status })

  logCreate('surveys', String(survey.id), event)

  return { success: true, survey }
})
