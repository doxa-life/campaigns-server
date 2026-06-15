import { peopleGroupSubscriptionService } from '../database/people-group-subscriptions'
import type { ContactMethod } from '../database/contact-methods'

/**
 * When an email contact method becomes verified — through any flow (prayer
 * signup, adoption, contact form, or an authenticated inbound email) — promote
 * that subscriber's pending prayer subscriptions to active and schedule their
 * next reminders. Pending subscriptions exist only for email delivery and stay
 * pending until the email is confirmed, so phone verifications are ignored.
 */
export default defineNitroPlugin(() => {
  addAction('contact.verified', async (contactMethod: ContactMethod) => {
    if (contactMethod.type !== 'email' || !contactMethod.subscriber_id) return

    const subscriberId = contactMethod.subscriber_id
    await peopleGroupSubscriptionService.activatePendingSubscriptions(subscriberId)
    // Schedule the first reminder for every active email subscription. The hook
    // fires only on the verified=false→true transition, so this runs once and
    // never reschedules an already-scheduled subscriber.
    await peopleGroupSubscriptionService.setNextRemindersForSubscriber(subscriberId)
  })
})
