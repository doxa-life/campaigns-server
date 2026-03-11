import { peopleGroupAdoptionService } from '../../../../../../database/people-group-adoptions'
import { peopleGroupService } from '../../../../../../database/people-groups'
import { groupService } from '../../../../../../database/groups'
import { subscriberService } from '../../../../../../database/subscribers'
import { contactMethodService } from '../../../../../../database/contact-methods'
import { sendAdoptionReminderEmail } from '../../../../../../utils/adoption-reminder-email'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const groupId = getIntParam(event, 'id')
  const adoptionId = getIntParam(event, 'adoptionId')

  const adoption = await peopleGroupAdoptionService.getById(adoptionId)
  if (!adoption || adoption.group_id !== groupId) {
    throw createError({ statusCode: 404, statusMessage: 'Adoption not found' })
  }

  const [group, peopleGroup] = await Promise.all([
    groupService.getById(groupId),
    peopleGroupService.getPeopleGroupById(adoption.people_group_id)
  ])

  if (!group || !group.primary_subscriber_id) {
    throw createError({ statusCode: 400, statusMessage: 'Group has no primary contact' })
  }

  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  const subscriber = await subscriberService.getSubscriberById(group.primary_subscriber_id)
  if (!subscriber) {
    throw createError({ statusCode: 400, statusMessage: 'Primary contact not found' })
  }

  const primaryEmail = await contactMethodService.getPrimaryEmail(subscriber.id)
  if (!primaryEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Primary contact has no email address' })
  }

  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'

  const success = await sendAdoptionReminderEmail({
    to: primaryEmail.value,
    contactName: subscriber.name,
    groupName: group.name,
    adoptions: [{
      peopleGroupName: peopleGroup.name,
      updateUrl: `${baseUrl}/adoption/update/${adoption.update_token}`
    }]
  })

  if (!success) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to send email' })
  }

  return { success: true, sentTo: primaryEmail.value }
})
