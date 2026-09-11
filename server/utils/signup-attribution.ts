// Where a signup came from: the utm_* parameters on the link the visitor
// arrived through and the page that referred them. The browser captures these
// on landing (see app/utils/attribution.ts) and sends them with the signup.

export interface SignupAttribution {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referrer: string | null
}

const MAX_UTM_LENGTH = 200
const MAX_REFERRER_LENGTH = 2048

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

export function readSignupAttribution(body: Record<string, unknown>): SignupAttribution {
  return {
    utm_source: cleanString(body.utm_source, MAX_UTM_LENGTH),
    utm_medium: cleanString(body.utm_medium, MAX_UTM_LENGTH),
    utm_campaign: cleanString(body.utm_campaign, MAX_UTM_LENGTH),
    referrer: cleanString(body.referrer, MAX_REFERRER_LENGTH)
  }
}

export function hasAttribution(attribution: SignupAttribution): boolean {
  return Object.values(attribution).some(v => v !== null)
}

// The non-empty attribution fields only, for analytics metadata and activity logs.
export function attributionFields(attribution: SignupAttribution): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(attribution)) {
    if (value) fields[key] = value
  }
  return fields
}
