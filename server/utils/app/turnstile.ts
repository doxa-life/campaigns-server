import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { useRuntimeConfig } from '#imports'

/**
 * Verify a Cloudflare Turnstile token. Skipped under vitest and when no
 * secret is configured — then every request passes.
 */
export async function verifyTurnstile(event: H3Event, token: string | undefined): Promise<boolean> {
  if (process.env.VITEST) return true
  const secret = useRuntimeConfig().turnstileSecretKey
  if (!secret) return true
  if (!token) return false

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: getRequestIP(event, { xForwardedFor: true }) || ''
      })
    })
    const result = (await response.json()) as { success?: boolean }
    return result.success === true
  } catch (error) {
    console.error('Turnstile verification failed:', error)
    return false
  }
}
