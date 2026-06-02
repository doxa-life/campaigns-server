import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupService } from '#server/database/people-groups'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.view')

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid people group ID'
    })
  }

  const canAccess = await peopleGroupService.userCanAccessPeopleGroup(user.userId, id)
  if (!canAccess) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupById(id)
  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  const contacts = await contactMethodService.getContactsConsentedToPeopleGroup(id)

  return {
    count: contacts.length,
    audience_type: 'people_group',
    people_group_id: id,
    people_group_name: peopleGroup.name
  }
})
