import { connectionService } from '../../../../database/connections'
import { subscriberService } from '../../../../database/subscribers'
import { groupService } from '../../../../database/groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const groupId = getIntParam(event, 'id')
  const query = getQuery(event)
  const subscriberId = parseInt(query.subscriber_id as string)

  if (!subscriberId) {
    throw createError({ statusCode: 400, statusMessage: 'subscriber_id is required' })
  }

  const [group, subscriber] = await Promise.all([
    groupService.getById(groupId),
    subscriberService.getSubscriberById(subscriberId)
  ])

  await connectionService.deleteByEntities('subscriber', subscriberId, 'group', groupId)
  logUpdate('groups', String(groupId), event, {
    message: 'Contact removed:',
    link_text: subscriber?.name || `#${subscriberId}`,
    link_url: `/admin/subscribers/${subscriberId}`
  })
  logUpdate('subscribers', String(subscriberId), event, {
    message: 'Removed from group:',
    link_text: group?.name || `#${groupId}`,
    link_url: `/admin/groups/${groupId}`
  })
  return { success: true }
})
