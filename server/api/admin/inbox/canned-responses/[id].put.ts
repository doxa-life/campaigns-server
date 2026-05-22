import { cannedResponseService } from '#server/database/canned-responses'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')
  const id = getIntParam(event, 'id')
  const body = await readBody<any>(event)
  const response = await cannedResponseService.update(id, {
    title: body.title,
    translations: body.translations
  })
  return { response }
})
