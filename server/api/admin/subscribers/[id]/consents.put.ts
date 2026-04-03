import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { getIntParam } from '#server/utils/api-helpers'
import { getSql } from '#server/database/db'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'subscribers.edit')

  const id = getIntParam(event, 'id')

  const subscriber = await subscriberService.getSubscriberById(id)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
  }

  const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
  const emailContact = contacts.find(c => c.type === 'email')
  if (!emailContact) {
    throw createError({ statusCode: 400, statusMessage: 'Subscriber has no email contact method' })
  }

  const body = await readBody<{
    type: 'doxa_general' | 'people_group'
    granted: boolean
    people_group_id?: number
  }>(event)

  if (body.type === 'doxa_general') {
    const oldValue = emailContact.consent_doxa_general
    await contactMethodService.updateDoxaConsent(emailContact.id, body.granted)
    logUpdate('subscribers', String(id), event, {
      changes: { consent_doxa_general: { from: oldValue, to: body.granted } }
    })
  } else if (body.type === 'people_group') {
    if (!body.people_group_id) {
      throw createError({ statusCode: 400, statusMessage: 'people_group_id is required' })
    }
    const currentIds = emailContact.consented_people_group_ids || []
    if (body.granted) {
      await contactMethodService.addPeopleGroupConsent(emailContact.id, body.people_group_id)
    } else {
      await contactMethodService.removePeopleGroupConsent(emailContact.id, body.people_group_id)
    }
    logUpdate('subscribers', String(id), event, {
      changes: { consent_people_group: { from: currentIds.includes(body.people_group_id), to: body.granted } }
    })
  } else {
    throw createError({ statusCode: 400, statusMessage: 'Invalid consent type' })
  }

  // Return updated consent state
  const updatedContacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
  const updatedEmail = updatedContacts.find(c => c.type === 'email')!
  const consentedIds = updatedEmail.consented_people_group_ids || []

  let peopleGroupNames: string[] = []
  if (consentedIds.length > 0) {
    const sql = getSql()
    const peopleGroups = await sql`
      SELECT id, name FROM people_groups WHERE id IN ${sql(consentedIds)}
    ` as { id: number; name: string }[]
    peopleGroupNames = consentedIds.map(pgId => {
      const pg = peopleGroups.find(p => p.id === pgId)
      return pg?.name || `People Group ${pgId}`
    })
  }

  return {
    success: true,
    consents: {
      doxa_general: updatedEmail.consent_doxa_general,
      doxa_general_at: updatedEmail.consent_doxa_general_at,
      people_group_ids: consentedIds,
      people_group_names: peopleGroupNames
    }
  }
})
