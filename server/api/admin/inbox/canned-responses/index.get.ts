import { cannedResponseService } from '#server/database/canned-responses'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')
  return { responses: await cannedResponseService.list() }
})
