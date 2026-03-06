import { connectionService } from '../../../../database/connections'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const groupId = getIntParam(event, 'id')
  const query = getQuery(event)
  const subscriberId = parseInt(query.subscriber_id as string)

  if (!subscriberId) {
    throw createError({ statusCode: 400, statusMessage: 'subscriber_id is required' })
  }

  await connectionService.deleteByEntities('subscriber', subscriberId, 'group', groupId)
  return { success: true }
})
