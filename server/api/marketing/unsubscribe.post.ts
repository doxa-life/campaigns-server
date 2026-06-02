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

  if (type === 'people_group' && slug) {
    const pg = await peopleGroupService.getPeopleGroupBySlug(slug)
    if (pg) await contactMethodService.removePeopleGroupConsent(email.id, pg.id)
  } else if (type === 'product') {
    await contactMethodService.updateProductEmailsConsent(email.id, false)
  } else {
    await contactMethodService.updateDoxaConsent(email.id, false)
  }

  console.log(`[MarketingUnsubscribe] one-click opt-out: profile=${profileId} type=${type}${slug ? ` slug=${slug}` : ''}`)
  return { success: true }
})
