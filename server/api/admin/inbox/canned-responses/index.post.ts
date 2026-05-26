import { cannedResponseService } from '#server/database/canned-responses'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'inbox.send')
  const body = await readBody<any>(event)
  if (!body.title) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  const response = await cannedResponseService.create({
    title: body.title,
    created_by: user.userId,
    translations: body.translations || []
  })
  return { response }
})
