import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'

type TrackingMetadata = Record<string, unknown>

interface TrackEventInput {
  eventType: string
  metadata?: TrackingMetadata | null
  value?: number | null
  language?: string | null
  anonymousHash?: string | null
  userHash?: string | null
  email?: string | null
  hostname?: string | null
}

const PII_METADATA_KEYS = new Set([
  'email',
  'email_address',
  'phone',
  'phone_number',
  'name',
  'first_name',
  'last_name',
  'full_name',
  'message',
  'message_text',
  'comments',
  'comment',
  'stories',
  'story',
  'profile_id',
  'profileId',
  'token',
  'verification_token',
  'contact_value'
])

export function userHashFromEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return null

  return createHash('sha256').update(normalized).digest('hex')
}

function sanitizeMetadata(metadata?: TrackingMetadata | null): TrackingMetadata | null {
  if (!metadata) return null

  const sanitized = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !PII_METADATA_KEYS.has(key))
  )

  return Object.keys(sanitized).length > 0 ? sanitized : null
}

function getHostname(event?: H3Event, fallback?: string | null): string | null {
  const host = event ? getHeader(event, 'host') : null
  if (host) return host

  if (!fallback) return null
  try {
    return new URL(fallback).hostname
  } catch {
    return fallback
  }
}

function getForwardedHeaders(event?: H3Event): Record<string, string> {
  if (!event) return {}

  // Only forward user-agent. The original client geo travels in the request body
  // (see buildGeoFromEvent) so Statinator gets correct per-user geo regardless of
  // the network path. Forwarding cf-connecting-ip is poisonous when Statinator is
  // behind Cloudflare — CF rejects it with error 1000 (loop protection).
  const headers: Record<string, string> = {}
  const ua = getHeader(event, 'user-agent')
  if (ua) headers['user-agent'] = ua
  return headers
}

function buildGeoFromEvent(event?: H3Event): Record<string, string> | undefined {
  if (!event) return undefined
  const ip = getHeader(event, 'cf-connecting-ip')
    || getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
  const country = getHeader(event, 'cf-ipcountry')
  const region = getHeader(event, 'cf-ipregion')
  const city = getHeader(event, 'cf-ipcity')
  const lat = getHeader(event, 'cf-iplatitude')
  const lon = getHeader(event, 'cf-iplongitude')

  const geo: Record<string, string> = {}
  if (ip) geo.ip = ip
  if (country) geo.country = country
  if (region) geo.region = region
  if (city) geo.city = city
  if (lat) geo.lat = lat
  if (lon) geo.lon = lon

  return Object.keys(geo).length > 0 ? geo : undefined
}

export async function trackEvent(event: H3Event | undefined, input: TrackEventInput): Promise<void> {
  const config = useRuntimeConfig()
  const statinatorUrl = String(config.public.statinatorUrl || '').replace(/\/$/, '')
  const apiKey = String(config.statinatorApiKey || '')
  const projectId = String(config.public.statinatorProjectId || 'doxa')

  if (!statinatorUrl || !apiKey) return

  try {
    await $fetch(`${statinatorUrl}/api/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        ...getForwardedHeaders(event)
      },
      body: {
        project_id: projectId,
        event_type: input.eventType,
        hostname: getHostname(event, input.hostname || config.public.siteUrl),
        metadata: sanitizeMetadata(input.metadata),
        value: input.value ?? null,
        language: input.language ?? null,
        anonymous_hash: input.anonymousHash || undefined,
        user_hash: input.userHash || userHashFromEmail(input.email)
      }
    })
  } catch (error: any) {
    const status = error?.status ?? error?.statusCode ?? error?.response?.status
    const detail = error?.data ? JSON.stringify(error.data) : (error?.message || String(error))
    console.error(`Statinator tracking failed for event: ${input.eventType} (status=${status ?? 'n/a'}): ${detail}`)
  }
}

export function trackEventInBackground(event: H3Event, input: TrackEventInput): void {
  const promise = trackEvent(event, input)
  const waitUntil = (event as unknown as { waitUntil?: (promise: Promise<unknown>) => void }).waitUntil

  if (typeof waitUntil === 'function') {
    waitUntil.call(event, promise)
  } else {
    void promise
  }
}
