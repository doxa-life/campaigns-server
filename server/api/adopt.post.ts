import { subscriberService } from '../database/subscribers'
import { groupService } from '../database/groups'
import { connectionService } from '../database/connections'
import { contactMethodService } from '../database/contact-methods'
import { peopleGroupAdoptionService } from '../database/people-group-adoptions'
import { peopleGroupService } from '../database/people-groups'
import { requireFormApiKey } from '../utils/form-api-key'
import { handleApiError } from '#server/utils/api-helpers'
import { sendAdoptionWelcomeEmail } from '../utils/adoption-welcome-email'
import { getDatabase } from '#server/database/db'

export default defineEventHandler(async (event) => {
  requireFormApiKey(event)

  const body = await readBody<{
    first_name: string
    last_name: string
    email: string
    phone?: string
    role?: string
    church_name?: string
    country?: string
    people_group: string
    permission_to_contact?: boolean
    confirm_public_display?: boolean
    language?: string
  }>(event)

  // Validate required fields
  const firstName = body.first_name?.trim()
  const lastName = body.last_name?.trim()
  const email = body.email?.trim().toLowerCase()
  const churchName = body.church_name?.trim()
  const peopleGroupSlug = body.people_group?.trim()

  if (!firstName || !lastName || !email || !peopleGroupSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: first_name, last_name, email, people_group' })
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email address' })
  }

  // Look up the people group by slug
  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(peopleGroupSlug)
  if (!peopleGroup) {
    throw createError({ statusCode: 404, statusMessage: 'People group not found' })
  }

  try {
    const fullName = `${firstName} ${lastName}`
    const phone = body.phone?.trim() || undefined
    const role = body.role?.trim() || undefined
    const language = body.language?.trim() || 'en'

    // Find or create the subscriber (champion)
    const { subscriber } = await subscriberService.findOrCreateSubscriber({
      email,
      phone,
      name: fullName,
      role,
      language
    })

    // Update role if subscriber already existed but role is new
    if (role && subscriber.role !== role) {
      await subscriberService.updateSubscriber(subscriber.id, { role })
    }

    // Find a group this subscriber is already connected to with the same name,
    // or create a new one. This avoids collisions between different churches
    // that happen to share a name.
    const groupName = churchName || fullName
    const existingConnections = await connectionService.getConnections('subscriber', subscriber.id, 'group')
    const connectedGroupIds = new Set(existingConnections.map(c =>
      c.from_type === 'subscriber' ? c.to_id : c.from_id
    ))

    let group = null
    if (connectedGroupIds.size > 0) {
      const matchingGroups = await groupService.getAll({ search: groupName, limit: 50 })
      group = matchingGroups.find(g =>
        g.name.toLowerCase() === groupName.toLowerCase() && connectedGroupIds.has(g.id)
      ) ?? null
    }

    if (!group) {
      group = await groupService.create({
        name: groupName,
        primary_subscriber_id: subscriber.id,
        country: body.country?.trim() || null
      })
      await connectionService.create({
        from_type: 'subscriber',
        from_id: subscriber.id,
        to_type: 'group',
        to_id: group.id,
        connection_type: 'champion'
      })
    }

    // Grant marketing consents
    const emailContact = await contactMethodService.getByValue('email', email)
    if (emailContact) {
      await contactMethodService.updateDoxaConsent(emailContact.id, true)
      if (body.permission_to_contact) {
        await contactMethodService.addPeopleGroupConsent(emailContact.id, peopleGroup.id)
      }
    }

    // Create the adoption (handle duplicate gracefully)
    let adoption
    try {
      adoption = await peopleGroupAdoptionService.create({
        people_group_id: peopleGroup.id,
        group_id: group.id,
        status: 'active',
        show_publicly: body.confirm_public_display ?? false
      })
    } catch (err: any) {
      if (err.code === '23505') {
        // Already adopted by this group — return success silently
        return { success: true }
      }
      throw err
    }

    // Send adoption welcome email (fire-and-forget)
    const db = getDatabase()
    const [totalRow, adoptedRow] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM people_groups').get(),
      db.prepare("SELECT COUNT(DISTINCT people_group_id) as count FROM people_group_adoptions WHERE status = 'active'").get(),
    ])
    const remainingCount = Number(totalRow.count) - Number(adoptedRow.count)

    sendAdoptionWelcomeEmail({
      to: email,
      firstName,
      peopleGroupName: peopleGroup.name,
      peopleGroupSlug: peopleGroup.slug!,
      imageUrl: peopleGroup.image_url,
      remainingGroupsCount: remainingCount,
      locale: language,
    }).catch(err => console.error('Failed to send adoption welcome email:', err))

    return {
      success: true,
      adoption_id: adoption.id,
      update_token: adoption.update_token
    }
  } catch (error: any) {
    handleApiError(error, 'Failed to process adoption form', 500)
  }
})
