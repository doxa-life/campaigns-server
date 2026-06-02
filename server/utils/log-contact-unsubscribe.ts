import type { H3Event } from 'h3'
import { logCreate } from './activity-logger'

export type UnsubscribeCategory = 'doxa' | 'product' | 'people_group'

const CATEGORY_MESSAGE: Record<Exclude<UnsubscribeCategory, 'people_group'>, string> = {
  doxa: 'Unsubscribed from Doxa general updates',
  product: 'Unsubscribed from product & feedback emails'
}

/**
 * Record a self-service email opt-out on the subscriber's CRM activity feed.
 *
 * Shared by the /unsubscribe page (via PUT /api/profile/:id) and the one-click
 * List-Unsubscribe endpoint so marketing/consent opt-outs surface on the contact
 * record the same way prayer-reminder unsubscribes already do (a logCreate entry
 * with a 'self_service' source). Callers must only invoke this on a real on→off
 * consent flip, so repeat unsubscribe visits don't double-log.
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
      message: 'Unsubscribed from updates for',
      link_text: peopleGroup.name,
      link_url: `/admin/people-groups/${peopleGroup.id}`
    })
    return
  }

  logCreate('subscribers', String(subscriberId), event, {
    source: 'self_service',
    message: CATEGORY_MESSAGE[category]
  })
}
