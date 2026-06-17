import type { H3Event } from 'h3'
import { logCreate } from './activity-logger'

export type UnsubscribeCategory = 'doxa' | 'product' | 'people_group'

const CATEGORY_MESSAGE: Record<Exclude<UnsubscribeCategory, 'people_group'>, string> = {
  doxa: 'Doxa general updates',
  product: 'Product & feedback emails'
}

/**
 * Record a self-service email opt-out on the subscriber's CRM activity feed.
 *
 * Shared by the /unsubscribe page (via PUT /api/profile/:id) and the one-click
 * List-Unsubscribe endpoint so marketing/consent opt-outs surface on the contact
 * record. Logged as a 'self_service' entry carrying an 'Unsubscribed' badge (see
 * the badge color/icon maps in RecordActivity.vue); the message names which email
 * stream was dropped. Callers must only invoke this on a real on→off consent
 * flip, so repeat unsubscribe visits don't double-log.
 */
export function logContactUnsubscribe(
  event: H3Event,
  subscriberId: number,
  category: UnsubscribeCategory,
  peopleGroup?: { id: number, name: string }
): void {
  if (category === 'people_group') {
    if (!peopleGroup) return
    logCreate('subscribers', String(subscriberId), event, {
      source: 'self_service',
      badge: 'Unsubscribed',
      message: 'People Group Marketing for',
      link_text: peopleGroup.name,
      link_url: `/admin/people-groups/${peopleGroup.id}`
    })
    return
  }

  logCreate('subscribers', String(subscriberId), event, {
    source: 'self_service',
    badge: 'Unsubscribed',
    message: CATEGORY_MESSAGE[category]
  })
}
