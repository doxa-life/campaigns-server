import { connectionService } from '../../../../database/connections'
import { subscriberService } from '../../../../database/subscribers'
import { groupService } from '../../../../database/groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const groupId = getIntParam(event, 'id')
  const body = await readBody<{ subscriber_id: number }>(event)

  if (!body.subscriber_id) {
    throw createError({ statusCode: 400, statusMessage: 'subscriber_id is required' })
  }

  const [group, subscriber] = await Promise.all([
    groupService.getById(groupId),
    subscriberService.getSubscriberById(body.subscriber_id)
  ])

  if (!group) throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  if (!subscriber) throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })

  try {
    const connection = await connectionService.create({
      from_type: 'subscriber',
      from_id: body.subscriber_id,
      to_type: 'group',
      to_id: groupId
    })
    logUpdate('groups', String(groupId), event, {
      message: 'Contact added:',
      link_text: subscriber.name || `#${body.subscriber_id}`,
      link_url: `/admin/subscribers/${body.subscriber_id}`
    })
    logUpdate('subscribers', String(body.subscriber_id), event, {
      message: 'Added to group:',
      link_text: group.name,
      link_url: `/admin/groups/${groupId}`
    })
    return { connection }
  } catch (error: any) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Subscriber is already linked to this group' })
    }
    throw error
  }
})
