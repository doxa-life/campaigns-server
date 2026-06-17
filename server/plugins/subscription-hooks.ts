import { peopleGroupSubscriptionService } from '../database/people-group-subscriptions'
import { subscriberService } from '../database/subscribers'
import { sendWelcomeEmail } from '../utils/welcome-email'
import type { ContactMethod } from '../database/contact-methods'

/**
 * When an email contact method becomes verified — through any flow (prayer
 * signup, adoption, contact form, or an authenticated inbound email) — promote
 * that subscriber's pending prayer subscriptions to active, schedule their next
 * reminders, and welcome them to every people group they signed up for. Pending
 * subscriptions exist only for email delivery and stay pending until the email is
 * confirmed, so phone verifications are ignored.
 *
 * A single verification covers all of a subscriber's signups, so the welcome is
 * sent per activated group here rather than tied to whichever link they clicked.
 */
export default defineNitroPlugin(() => {
  addAction('contact.verified', async (contactMethod: ContactMethod) => {
    if (contactMethod.type !== 'email' || !contactMethod.subscriber_id) return

    const subscriberId = contactMethod.subscriber_id
    const activated = await peopleGroupSubscriptionService.activatePendingSubscriptions(subscriberId)
    // Schedule the first reminder for every active email subscription. The hook
    // fires only on the verified=false→true transition, so this runs once and
    // never reschedules an already-scheduled subscriber.
    await peopleGroupSubscriptionService.setNextRemindersForSubscriber(subscriberId)

    if (activated.length === 0) return
    const subscriber = await subscriberService.getSubscriberById(subscriberId)
    if (!subscriber) return
    const locale = subscriber.preferred_language || 'en'

    // Fire-and-forget so confirmation never blocks the verification request.
    for (const sub of activated) {
      if (sub.delivery_method !== 'email') continue
      sendWelcomeEmail(
        contactMethod.value,
        subscriber.name,
        sub.people_group_name,
        sub.people_group_slug,
        subscriber.profile_id,
        locale,
        subscriber.tracking_id,
        sub.time_preference ?? undefined,
        sub.time_preference ? {
          subscriptionId: sub.id,
          frequency: sub.frequency,
          daysOfWeek: sub.days_of_week.length > 0 ? sub.days_of_week : undefined,
          timezone: sub.timezone,
          prayerDuration: sub.prayer_duration
        } : undefined
      ).catch(err => console.error('Failed to send welcome email:', err))
    }
  })
})
