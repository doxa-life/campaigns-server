// Subscriber-level engagement status, derived from the statuses of all the
// subscriber's campaign_subscriptions. First matching status in precedence
// order wins; a subscriber with no subscriptions is 'none'.
export const SUBSCRIBER_STATUS_PRECEDENCE = ['active', 'pending', 'unsubscribed', 'inactive'] as const

export type SubscriberStatus = (typeof SUBSCRIBER_STATUS_PRECEDENCE)[number] | 'none'

export const SUBSCRIBER_STATUS_LABELS: Record<SubscriberStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  inactive: 'Inactive',
  unsubscribed: 'Unsubscribed',
  none: 'No subscriptions',
}

export const SUBSCRIBER_STATUS_COLORS: Record<SubscriberStatus, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  pending: 'info',
  inactive: 'warning',
  unsubscribed: 'error',
  none: 'neutral',
}

export function deriveSubscriberStatus(subscriptions: Array<{ status: string }>): SubscriberStatus {
  for (const status of SUBSCRIBER_STATUS_PRECEDENCE) {
    if (subscriptions.some(s => s.status === status)) return status
  }
  return 'none'
}
