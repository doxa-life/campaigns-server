/**
 * POST /api/marketing/unsubscribe
 *
 * RFC 8058 one-click unsubscribe target for the List-Unsubscribe header on
 * marketing emails. Mailbox providers (Gmail/Yahoo/Apple Mail) POST here when a
 * recipient hits their native "Unsubscribe" button — no page render, no JS — so
 * the opt-out must happen server-side here, mirroring what the /unsubscribe page
 * does client-side for human visitors.
 *
 * Params (query string, carried by the header URL): `id` (profile id), `type`
 * (doxa | product | people_group), and `slug` for the people_group case.
 *
 * Always responds 200, even when the subscriber can't be resolved: a non-200
 * makes compliant clients retry, and we don't want to confirm/deny a profile.
 */
import { subscriberService } from '#server/database/subscribers'
import { contactMethodService } from '#server/database/contact-methods'
import { peopleGroupService } from '#server/database/people-groups'
import { logContactUnsubscribe } from '#server/utils/log-contact-unsubscribe'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const profileId = query.id as string | undefined
  const type = (query.type as string) || 'doxa'
  const slug = query.slug as string | undefined

  if (!profileId) return { success: true }

  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber) return { success: true }

  const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
  const email = contacts.find(c => c.type === 'email')
  if (!email) return { success: true }

  // Only act + log when the consent actually flips on→off, so a mailbox provider
  // re-POSTing the same one-click link doesn't unsubscribe-then-double-record.
  if (type === 'people_group' && slug) {
    const pg = await peopleGroupService.getPeopleGroupBySlug(slug)
    if (pg && (email.consented_people_group_ids || []).includes(pg.id)) {
      await contactMethodService.removePeopleGroupConsent(email.id, pg.id)
      logContactUnsubscribe(event, subscriber.id, 'people_group', { id: pg.id, name: pg.name })
    }
  } else if (type === 'product') {
    if (email.consent_product_emails !== false) {
      await contactMethodService.updateProductEmailsConsent(email.id, false)
      logContactUnsubscribe(event, subscriber.id, 'product')
    }
  } else {
    if (email.consent_doxa_general) {
      await contactMethodService.updateDoxaConsent(email.id, false)
      logContactUnsubscribe(event, subscriber.id, 'doxa')
    }
  }

  console.log(`[MarketingUnsubscribe] one-click opt-out: profile=${profileId} type=${type}${slug ? ` slug=${slug}` : ''}`)
  return { success: true }
})
