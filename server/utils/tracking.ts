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

  const headers: Record<string, string> = {}
  for (const name of [
    'user-agent',
    'cf-connecting-ip',
    'x-forwarded-for',
    'cf-ipcountry',
    'cf-ipregion',
    'cf-ipcity',
    'cf-iplatitude',
    'cf-iplongitude'
  ]) {
    const value = getHeader(event, name)
    if (value) headers[name] = value
  }
  return headers
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
  } catch {
    console.error(`Statinator tracking failed for event: ${input.eventType}`)
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
