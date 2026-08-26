// Single source of truth for marketing-email audience display labels.
// The `people_group` and `pick` audiences have no fixed label — they resolve
// per-email (group name, picked-contact count) in marketingAudienceLabel.

export type StaticMarketingAudience = 'doxa' | 'doxa_active_pg' | 'doxa_inactive_pg' | 'active_pg' | 'admins'

export const MARKETING_AUDIENCE_LABELS: Record<StaticMarketingAudience, string> = {
  doxa: 'DOXA General',
  doxa_active_pg: 'Active Subscribers with Doxa General Consent',
  doxa_inactive_pg: 'Inactive Subscribers with Doxa General Consent',
  active_pg: 'All Active Subscribers',
  admins: 'Admins'
}

export function isStaticMarketingAudience(type: string): type is StaticMarketingAudience {
  return type in MARKETING_AUDIENCE_LABELS
}

// Badge label for a saved marketing email.
export function marketingAudienceLabel(email: {
  audience_type: string
  people_group_name?: string | null
  recipient_contact_method_ids?: number[] | null
}): string {
  if (isStaticMarketingAudience(email.audience_type)) return MARKETING_AUDIENCE_LABELS[email.audience_type]
  if (email.audience_type === 'pick') return `Picked Contacts (${email.recipient_contact_method_ids?.length ?? 0})`
  return email.people_group_name || 'People Group'
}
