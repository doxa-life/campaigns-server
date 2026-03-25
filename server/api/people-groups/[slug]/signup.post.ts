/**
 * POST /api/people-groups/:slug/signup
 * Sign up for prayer reminders for a people group
 */
import { peopleGroupService } from '#server/database/people-groups'
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { sendSignupVerificationEmail } from '#server/utils/signup-verification-email'
import { sendWelcomeEmail } from '#server/utils/welcome-email'
import { isValidTimezone } from '#server/utils/next-reminder-calculator'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'People group slug is required'
    })
  }

  // Get people group by slug
  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Get request body
  const body = await readBody(event)

  // Validate required fields
  if (!body.name || !body.delivery_method || !body.frequency || !body.reminder_time) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: name, delivery_method, frequency, reminder_time'
    })
  }

  // Validate delivery method
  if (!['email', 'whatsapp', 'app'].includes(body.delivery_method)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid delivery method. Must be email, whatsapp, or app'
    })
  }

  // Validate email for email delivery
  if (body.delivery_method === 'email' && !body.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required for email delivery'
    })
  }

  // Validate phone for whatsapp delivery
  if (body.delivery_method === 'whatsapp' && !body.phone) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Phone number is required for WhatsApp delivery'
    })
  }

  // Validate weekly frequency has days selected
  if (body.frequency === 'weekly' && (!body.days_of_week || body.days_of_week.length === 0)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Days of week are required for weekly frequency'
    })
  }

  // Validate and normalize timezone (default to UTC if invalid or missing)
  const timezone = body.timezone && isValidTimezone(body.timezone) ? body.timezone : 'UTC'

  // Normalize language (default to 'en' if invalid or missing)
  const language = body.language && ['en', 'es', 'fr'].includes(body.language) ? body.language : 'en'

  try {
    // Find or create subscriber
    const { subscriber, isNew } = await subscriberService.findOrCreateSubscriber({
      email: body.email,
      phone: body.phone,
      name: body.name,
      language
    })

    // Update name and language if subscriber exists
    if (!isNew) {
      const updates: { name?: string; preferred_language?: string } = {}
      if (body.name && body.name !== subscriber.name) {
        updates.name = body.name
      }
      // Update language if provided (allow users to change their preferred language)
      if (language && language !== subscriber.preferred_language) {
        updates.preferred_language = language
      }
      if (Object.keys(updates).length > 0) {
        await subscriberService.updateSubscriber(subscriber.id, updates)
      }
    }

    // Handle consent preferences (stored on the contact method)
    if (body.consent_people_group_updates || body.consent_doxa_general) {
      // Get the contact method for the delivery channel
      let contactMethod = null
      if (body.email) {
        contactMethod = await contactMethodService.getByValue('email', body.email)
      } else if (body.phone) {
        contactMethod = await contactMethodService.getByValue('phone', body.phone)
      }

      if (contactMethod) {
        if (body.consent_people_group_updates) {
          await contactMethodService.addPeopleGroupConsent(contactMethod.id, peopleGroup.id)
        }
        if (body.consent_doxa_general) {
          await contactMethodService.updateDoxaConsent(contactMethod.id, true)
        }
      }
    }

    const existingSubscriptions = await peopleGroupSubscriptionService.getAllBySubscriberAndPeopleGroup(
      subscriber.id,
      peopleGroup.id
    )

    const MAX_SUBSCRIPTIONS_PER_PEOPLE_GROUP = 5

    const activeCount = existingSubscriptions.filter(s => s.status === 'active' || s.status === 'pending').length
    if (activeCount >= MAX_SUBSCRIPTIONS_PER_PEOPLE_GROUP) {
      // At limit - send welcome email to prevent email enumeration
      if (body.delivery_method === 'email' && body.email) {
        await sendWelcomeEmail(
          body.email,
          body.name,
          peopleGroup.name,
          slug,
          subscriber.profile_id,
          language,
          subscriber.tracking_id,
          body.reminder_time
        )
      }
      // Return same response as new signup for privacy
      return {
        message: 'Please check your email to complete your signup'
      }
    }

    // Check for duplicate (same frequency + time_preference)
    const duplicate = existingSubscriptions.find(
      s => (s.status === 'active' || s.status === 'pending') &&
           s.frequency === body.frequency &&
           s.time_preference === body.reminder_time
    )

    if (duplicate) {
      // Duplicate schedule - send welcome email to prevent email enumeration
      if (body.delivery_method === 'email' && body.email) {
        await sendWelcomeEmail(
          body.email,
          body.name,
          peopleGroup.name,
          slug,
          subscriber.profile_id,
          language,
          subscriber.tracking_id,
          body.reminder_time
        )
      }
      // Return same response as new signup for privacy
      return {
        message: 'Please check your email to complete your signup'
      }
    }

    // Check if there's an unsubscribed subscription with the same schedule to reactivate
    const unsubscribedMatch = existingSubscriptions.find(
      s => s.status === 'unsubscribed' &&
           s.frequency === body.frequency &&
           s.time_preference === body.reminder_time
    )

    if (unsubscribedMatch) {
      // Reactivate the matching unsubscribed subscription
      await peopleGroupSubscriptionService.updateSubscription(unsubscribedMatch.id, {
        delivery_method: body.delivery_method,
        days_of_week: body.days_of_week,
        timezone,
        prayer_duration: body.prayer_duration
      })

      // For email delivery, check verification to determine status
      if (body.delivery_method === 'email') {
        const emailContact = await contactMethodService.getByValue('email', body.email)
        const resubscribeStatus = emailContact?.verified ? 'active' : 'pending'
        await peopleGroupSubscriptionService.resubscribe(unsubscribedMatch.id, resubscribeStatus)

        if (emailContact && !emailContact.verified) {
          const token = await contactMethodService.generateVerificationToken(emailContact.id)
          await sendSignupVerificationEmail(body.email, token, slug, peopleGroup.name, body.name, language)
        } else if (emailContact?.verified) {
          await sendWelcomeEmail(body.email, body.name, peopleGroup.name, slug, subscriber.profile_id, language, subscriber.tracking_id, body.reminder_time)
        }
      } else {
        await peopleGroupSubscriptionService.resubscribe(unsubscribedMatch.id)
      }

      // Return same response for privacy
      return {
        message: 'Please check your email to complete your signup'
      }
    }

    // Determine subscription status based on email verification
    let subscriptionStatus: 'active' | 'pending' = 'active'
    let emailContact = null
    if (body.delivery_method === 'email') {
      emailContact = await contactMethodService.getByValue('email', body.email)
      if (!emailContact?.verified) {
        subscriptionStatus = 'pending'
      }
    }

    // Create new subscription
    const subscription = await peopleGroupSubscriptionService.createSubscription({
      people_group_id: peopleGroup.id,
      subscriber_id: subscriber.id,
      delivery_method: body.delivery_method,
      frequency: body.frequency,
      days_of_week: body.days_of_week,
      time_preference: body.reminder_time,
      timezone,
      prayer_duration: body.prayer_duration,
      status: subscriptionStatus
    })

    // For email delivery, handle verification
    if (body.delivery_method === 'email') {
      if (emailContact?.verified) {
        // Email already verified - send welcome
        await sendWelcomeEmail(body.email, body.name, peopleGroup.name, slug, subscriber.profile_id, language, subscriber.tracking_id, body.reminder_time)
      } else if (emailContact) {
        // Email not verified - send verification email
        const token = await contactMethodService.generateVerificationToken(emailContact.id)
        await sendSignupVerificationEmail(body.email, token, slug, peopleGroup.name, body.name, language)
      }

      // Always return same response for email signups
      return {
        message: 'Please check your email to complete your signup'
      }
    }

    // For non-email delivery (WhatsApp, app), return success
    return {
      success: true,
      message: 'Successfully signed up for prayer reminders'
    }
  } catch (error) {
    handleApiError(error, 'Failed to create signup')
  }
})
