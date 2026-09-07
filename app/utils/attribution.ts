// Where the current visitor came from, remembered in the browser so a later
// signup can carry it. A visit counts as a new touch when it arrives through a
// utm-tagged link or from an external page; direct visits and in-site
// navigation keep the previously captured touch (last non-direct touch).

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export type UtmKey = typeof UTM_KEYS[number]

export type UtmParams = Partial<Record<UtmKey, string>>

export interface Attribution extends UtmParams {
  referrer?: string
  captured_at: string
}

export interface SignupAttribution {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  referrer?: string
}

interface LandingPage {
  search: string
  referrer: string
  hostname: string
}

const STORAGE_KEY = 'doxa_attribution'
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export function readUtmParams(search: string): UtmParams {
  const params = new URLSearchParams(search)
  const utm: UtmParams = {}
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim()
    if (value) utm[key] = value
  }
  return utm
}

function externalReferrer(referrer: string, hostname: string): string | null {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname === hostname ? null : referrer
  } catch {
    return null
  }
}

function currentPage(): LandingPage | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  return {
    search: window.location.search,
    referrer: document.referrer,
    hostname: window.location.hostname
  }
}

export function captureAttribution(page: LandingPage | null = currentPage(), now: number = Date.now()): void {
  if (!page) return
  const utm = readUtmParams(page.search)
  const referrer = externalReferrer(page.referrer, page.hostname)
  if (Object.keys(utm).length === 0 && !referrer) return

  const attribution: Attribution = { ...utm, captured_at: new Date(now).toISOString() }
  if (referrer) attribution.referrer = referrer
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution))
  } catch {
    // Storage unavailable (private mode, sandboxed frame); attribution is best-effort.
  }
}

export function getAttribution(now: number = Date.now()): Attribution | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const attribution = JSON.parse(raw) as Attribution
    const age = now - new Date(attribution.captured_at).getTime()
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null
    return attribution
  } catch {
    return null
  }
}

// The attribution fields a signup request carries.
export function signupAttribution(now: number = Date.now()): SignupAttribution {
  const attribution = getAttribution(now)
  if (!attribution) return {}
  const fields: SignupAttribution = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'referrer'] as const) {
    if (attribution[key]) fields[key] = attribution[key]
  }
  return fields
}
