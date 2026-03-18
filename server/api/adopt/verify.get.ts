/**
 * GET /api/adopt/verify
 * Verify email address for people group adoption
 */
import { contactMethodService } from '#server/database/contact-methods'
import { subscriberService } from '#server/database/subscribers'
import { pendingAdoptionService } from '#server/database/pending-adoptions'
import { peopleGroupAdoptionService } from '#server/database/people-group-adoptions'
import { peopleGroupService } from '#server/database/people-groups'
import { groupService } from '#server/database/groups'
import { sendAdoptionWelcomeEmail } from '#server/utils/adoption-welcome-email'
import { notifyAdoptionRecipients } from '#server/utils/adoption-notification-email'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token is required'
    })
  }

  // Verify the token
  const result = await contactMethodService.verifyByToken(token)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: result.error || 'Verification failed'
    })
  }

  if (!result.contactMethod) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification failed'
    })
  }

  // Find and process pending adoptions for this contact method
  const pendingAdoptions = await pendingAdoptionService.getByContactMethodId(result.contactMethod.id)

  let firstPeopleGroupName: string | null = null
  let firstPeopleGroupSlug: string | null = null

  // Compute remaining count once (only needed for welcome emails on new verifications)
  const remainingCount = !result.alreadyVerified && pendingAdoptions.length > 0
    ? await peopleGroupService.getRemainingUnadoptedCount()
    : 0

  for (const pending of pendingAdoptions) {
    const formData = typeof pending.form_data === 'string'
      ? JSON.parse(pending.form_data)
      : pending.form_data

    // Create the real adoption record
    try {
      await peopleGroupAdoptionService.create({
        people_group_id: pending.people_group_id,
        group_id: pending.group_id,
        status: 'active',
        show_publicly: formData.show_publicly ?? false
      })
    } catch (err: any) {
      if (err.code !== '23505') throw err
      // Duplicate — already adopted, continue
    }

    // Look up people group and group for emails and logging
    const peopleGroup = await peopleGroupService.getPeopleGroupById(pending.people_group_id)
    const group = await groupService.getById(pending.group_id)

    if (peopleGroup && group) {
      logUpdate('people_groups', String(peopleGroup.id), event, {
        badge: 'Linked',
        source: 'Adoption Form',
        message: 'Adopted by',
        link_text: group.name,
        link_url: `/admin/groups/${group.id}`
      })
      logUpdate('groups', String(group.id), event, {
        badge: 'Linked',
        source: 'Adoption Form',
        message: 'Adoption added:',
        link_text: peopleGroup.name,
        link_url: `/admin/people-groups/${peopleGroup.id}`
      })
    }

    if (peopleGroup) {
      if (!firstPeopleGroupName) {
        firstPeopleGroupName = peopleGroup.name
        firstPeopleGroupSlug = pending.people_group_slug
      }

      // Send adoption welcome email (only for new verifications)
      if (!result.alreadyVerified) {
        sendAdoptionWelcomeEmail({
          to: result.contactMethod.value,
          firstName: formData.first_name || '',
          peopleGroupName: peopleGroup.name,
          peopleGroupSlug: pending.people_group_slug,
          imageUrl: peopleGroup.image_url,
          remainingGroupsCount: remainingCount,
          locale: formData.locale || 'en',
        }).catch(err => console.error('Failed to send adoption welcome email:', err))
      }

      const subscriber = await subscriberService.getSubscriberById(result.contactMethod.subscriber_id)

      notifyAdoptionRecipients({
        peopleGroupName: peopleGroup.name,
        peopleGroupId: peopleGroup.id,
        churchOrGroupName: group?.name || '',
        groupId: pending.group_id,
        contactName: subscriber?.name || formData.first_name || '',
        contactEmail: result.contactMethod.value,
        subscriberId: result.contactMethod.subscriber_id,
        phone: formData.phone,
        role: subscriber?.role || undefined,
        language: subscriber?.preferred_language || formData.locale,
        country: formData.country,
        permissionToContact: formData.permission_to_contact ?? false,
        confirmPublicDisplay: formData.show_publicly ?? false,
      }).catch(err => console.error('Failed to notify adoption recipients:', err))
    }

    // Remove the pending record
    await pendingAdoptionService.delete(pending.id)
  }

  return {
    success: true,
    people_group_name: firstPeopleGroupName,
    people_group_slug: firstPeopleGroupSlug,
    already_verified: result.alreadyVerified === true
  }
})
