import { connectionService } from '../../../../database/connections'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'subscribers.view')

  const subscriberId = getIntParam(event, 'id')
  const groups = await connectionService.getGroupsForSubscriber(subscriberId)

  return { groups }
})
