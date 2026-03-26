import { subscriberService } from '../database/subscribers'
import { groupService } from '../database/groups'
import { connectionService } from '../database/connections'
import { contactMethodService } from '../database/contact-methods'
import { peopleGroupAdoptionService } from '../database/people-group-adoptions'
import { peopleGroupService } from '../database/people-groups'
import { pendingAdoptionService } from '../database/pending-adoptions'
import { requireFormApiKey } from '../utils/form-api-key'
import { handleApiError } from '#server/utils/api-helpers'
import { sendAdoptionWelcomeEmail } from '../utils/adoption-welcome-email'
import { sendAdoptionVerificationEmail } from '../utils/adoption-verification-email'
import { notifyAdoptionRecipients } from '../utils/adoption-notification-email'

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

    await subscriberService.addSource(subscriber.id, 'adoption')

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
      logCreate('groups', String(group.id), event, {
        source: 'Adoption Form',
        message: 'Created from adoption form. Primary contact:',
        link_text: fullName,
        link_url: `/admin/subscribers/${subscriber.id}`
      })
      logUpdate('subscribers', String(subscriber.id), event, {
        badge: 'Linked',
        source: 'Adoption Form',
        message: 'Connected to group:',
        link_text: group.name,
        link_url: `/admin/groups/${group.id}`
      })
    }

    // Log form submission on the contact record
    logCreate('subscribers', String(subscriber.id), event, {
      source: 'Adoption Form',
      message: 'Adoption form submitted',
      form_values: {
        name: fullName,
        people_group: peopleGroup.name,
        email,
        phone: phone || null,
        church: churchName || null,
        role: role || null,
        country: body.country?.trim() || null,
        language,
        public_display: body.confirm_public_display ?? false,
        permission_to_contact: body.permission_to_contact ?? false
      }
    })

    // Grant marketing consents
    const emailContact = await contactMethodService.getByValue('email', email)
    if (emailContact) {
      await contactMethodService.updateDoxaConsent(emailContact.id, true)
      if (body.permission_to_contact) {
        await contactMethodService.addPeopleGroupConsent(emailContact.id, peopleGroup.id)
      }
    }

    // If email is not verified, create pending adoption and send verification email
    if (emailContact && !emailContact.verified) {
      await pendingAdoptionService.createOrUpdate({
        contact_method_id: emailContact.id,
        people_group_id: peopleGroup.id,
        group_id: group.id,
        people_group_slug: peopleGroupSlug,
        form_data: {
          show_publicly: body.confirm_public_display ?? false,
          permission_to_contact: body.permission_to_contact ?? false,
          locale: language,
          first_name: firstName,
          phone: phone,
          country: body.country?.trim(),
        }
      })

      const token = await contactMethodService.generateVerificationToken(emailContact.id)
      sendAdoptionVerificationEmail(
        email,
        token,
        peopleGroup.name,
        fullName,
        language
      ).catch(err => console.error('Failed to send adoption verification email:', err))

      return { success: true, needs_verification: true }
    }

    // Email is already verified — create the adoption immediately
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

    logUpdate('people_groups', String(peopleGroup.id), event, {
      badge: 'Linked',
      source: 'Adoption Form',
      message: 'Adopted by',
      link_text: groupName,
      link_url: `/admin/groups/${group.id}`
    })
    logUpdate('groups', String(group.id), event, {
      badge: 'Linked',
      source: 'Adoption Form',
      message: 'Adoption added:',
      link_text: peopleGroup.name,
      link_url: `/admin/people-groups/${peopleGroup.id}`
    })

    // Send adoption welcome email (fire-and-forget)
    const remainingCount = await peopleGroupService.getRemainingUnadoptedCount()

    sendAdoptionWelcomeEmail({
      to: email,
      firstName,
      peopleGroupName: peopleGroup.name,
      peopleGroupSlug: peopleGroup.slug!,
      imageUrl: peopleGroup.image_url,
      remainingGroupsCount: remainingCount,
      locale: language,
    }).catch(err => console.error('Failed to send adoption welcome email:', err))

    notifyAdoptionRecipients({
      peopleGroupName: peopleGroup.name,
      peopleGroupId: peopleGroup.id,
      churchOrGroupName: groupName,
      groupId: group.id,
      contactName: fullName,
      contactEmail: email,
      subscriberId: subscriber.id,
      phone: body.phone?.trim(),
      role,
      language,
      country: body.country?.trim(),
      permissionToContact: body.permission_to_contact ?? false,
      confirmPublicDisplay: body.confirm_public_display ?? false,
    }).catch(err => console.error('Failed to notify adoption recipients:', err))

    return {
      success: true,
      adoption_id: adoption.id,
      update_token: adoption.update_token
    }
  } catch (error: any) {
    handleApiError(error, 'Failed to process adoption form', 500)
  }
})
