/**
 * GET /api/adopt/verify
 * Verify email address for people group adoption
 */
import { contactMethodService } from '#server/database/contact-methods'
import { pendingAdoptionService } from '#server/database/pending-adoptions'
import { peopleGroupAdoptionService } from '#server/database/people-group-adoptions'
import { peopleGroupService } from '#server/database/people-groups'
import { sendAdoptionWelcomeEmail } from '#server/utils/adoption-welcome-email'

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

    // Look up people group for the welcome email
    const peopleGroup = await peopleGroupService.getPeopleGroupById(pending.people_group_id)
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
