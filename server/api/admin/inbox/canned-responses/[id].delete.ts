import { cannedResponseService } from '#server/database/canned-responses'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')
  const id = getIntParam(event, 'id')
  await cannedResponseService.delete(id)
  return { success: true }
})
