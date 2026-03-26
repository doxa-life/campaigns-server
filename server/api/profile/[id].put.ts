import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { peopleGroupService } from '#server/database/people-groups'
import { sendSignupVerificationEmail } from '#server/utils/signup-verification-email'

export default defineEventHandler(async (event) => {
  const profileId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!profileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Profile ID is required'
    })
  }

  // Get the subscriber
  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)

  if (!subscriber) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Subscriber not found'
    })
  }

  // Get current email contact
  const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
  const currentEmail = contacts.find(c => c.type === 'email')

  // Validation
  if (body.name !== undefined && typeof body.name !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid name'
    })
  }

  if (body.email !== undefined) {
    if (typeof body.email !== 'string' || !body.email.includes('@')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid email address'
      })
    }
  }

  if (body.frequency !== undefined && !['daily', 'weekly'].includes(body.frequency)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Frequency must be daily or weekly'
    })
  }

  if (body.frequency === 'weekly' && body.days_of_week !== undefined) {
    if (!Array.isArray(body.days_of_week) || body.days_of_week.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Please select at least one day for weekly reminders'
      })
    }
  }

  let emailChanged = false
  let newEmailContact = currentEmail

  // Handle global subscriber updates (name)
  if (body.name !== undefined && body.name.trim() !== subscriber.name) {
    await subscriberService.updateSubscriber(subscriber.id, { name: body.name.trim() })
  }

  // Handle email change (global - affects all subscriptions)
  if (body.email !== undefined) {
    const newEmail = body.email.trim().toLowerCase()
    const oldEmail = currentEmail?.value?.toLowerCase()

    if (newEmail !== oldEmail) {
      // Check if new email already exists for another subscriber
      const existingContact = await contactMethodService.getByValue('email', newEmail)
      if (existingContact && existingContact.subscriber_id !== subscriber.id) {
        throw createError({
          statusCode: 400,
          statusMessage: 'This email is already in use by another subscriber'
        })
      }

      if (currentEmail) {
        // Update existing email contact (resets verification)
        await contactMethodService.updateContactMethod(currentEmail.id, { value: newEmail })
        newEmailContact = await contactMethodService.getById(currentEmail.id) ?? undefined
      } else {
        // Create new email contact
        newEmailContact = await contactMethodService.addContactMethod(subscriber.id, 'email', newEmail)
      }

      emailChanged = true

      // Send verification email - need a people group for context
      if (newEmailContact) {
        // Get subscriber's first subscription to use for verification email context
        const subscriptions = await peopleGroupSubscriptionService.getSubscriberSubscriptions(subscriber.id)
        if (subscriptions.length > 0) {
          const peopleGroup = await peopleGroupService.getPeopleGroupById(subscriptions[0]!.people_group_id)
          if (peopleGroup && newEmailContact) {
            const verificationToken = await contactMethodService.generateVerificationToken(newEmailContact.id)
            await sendSignupVerificationEmail(
              newEmail,
              verificationToken,
              peopleGroup.slug!,
              peopleGroup.name,
              body.name?.trim() || subscriber.name
            )
          }
        }
      }
    }
  }

  // Handle consent updates (stored on contact method)
  if (currentEmail) {
    if (body.consent_doxa_general !== undefined) {
      await contactMethodService.updateDoxaConsent(currentEmail.id, body.consent_doxa_general)
    }

    // People group consent update
    if (body.consent_people_group_id !== undefined && body.consent_people_group_updates !== undefined) {
      if (body.consent_people_group_updates) {
        await contactMethodService.addPeopleGroupConsent(currentEmail.id, body.consent_people_group_id)
      } else {
        await contactMethodService.removePeopleGroupConsent(currentEmail.id, body.consent_people_group_id)
      }
    }
  }

  // Handle subscription-specific updates (requires subscription_id)
  let updatedSubscription = null
  if (body.subscription_id) {
    // Security: Verify subscription belongs to this subscriber
    const subscription = await peopleGroupSubscriptionService.getById(body.subscription_id)
    if (!subscription) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Subscription not found'
      })
    }
    if (subscription.subscriber_id !== subscriber.id) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Unauthorized: Subscription does not belong to this profile'
      })
    }

    const subscriptionUpdates: {
      delivery_method?: 'email' | 'whatsapp' | 'app'
      frequency?: string
      days_of_week?: number[]
      time_preference?: string
      timezone?: string
      prayer_duration?: number
    } = {}

    if (body.delivery_method !== undefined) subscriptionUpdates.delivery_method = body.delivery_method
    if (body.frequency !== undefined) subscriptionUpdates.frequency = body.frequency
    if (body.days_of_week !== undefined) subscriptionUpdates.days_of_week = body.days_of_week
    if (body.time_preference !== undefined) subscriptionUpdates.time_preference = body.time_preference
    if (body.timezone !== undefined) subscriptionUpdates.timezone = body.timezone
    if (body.prayer_duration !== undefined) subscriptionUpdates.prayer_duration = body.prayer_duration

    if (Object.keys(subscriptionUpdates).length > 0) {
      updatedSubscription = await peopleGroupSubscriptionService.updateSubscription(
        body.subscription_id,
        subscriptionUpdates
      )
    }
  }

  // Get updated subscriber info
  const updatedSubscriber = await subscriberService.getSubscriberById(subscriber.id)
  const updatedContacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
  const updatedEmail = updatedContacts.find(c => c.type === 'email')

  // Build consent state for response
  const consents = {
    doxa_general: updatedEmail?.consent_doxa_general || false,
    people_group_ids: updatedEmail?.consented_people_group_ids || []
  }

  const response: any = {
    success: true,
    email_changed: emailChanged,
    subscriber: {
      id: updatedSubscriber?.id,
      profile_id: updatedSubscriber?.profile_id,
      name: updatedSubscriber?.name || subscriber.name,
      email: updatedEmail?.value || '',
      email_verified: updatedEmail?.verified || false
    },
    consents
  }

  // Include updated subscription if one was updated
  if (updatedSubscription) {
    response.currentSubscription = {
      id: updatedSubscription.id,
      delivery_method: updatedSubscription.delivery_method,
      frequency: updatedSubscription.frequency,
      days_of_week: updatedSubscription.days_of_week,
      time_preference: updatedSubscription.time_preference,
      timezone: updatedSubscription.timezone,
      prayer_duration: updatedSubscription.prayer_duration,
      status: updatedSubscription.status
    }
  }

  return response
})
