import { sql } from './database'
import { logEvent } from './activity-logger'

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds?: number
}

/**
 * Check rate limit by counting recent events in activity_logs.
 * Uses metadata JSONB field to match identifier (email or IP).
 */
export async function checkRateLimit(
  eventType: string,
  identifierField: string,
  identifierValue: string,
  windowMs: number,
  maxAttempts: number
): Promise<RateLimitResult> {
  const windowStart = Date.now() - windowMs

  try {
    const result = await sql`
      SELECT
        COUNT(*)::int as count,
        MIN(timestamp) as oldest_attempt
      FROM activity_logs
      WHERE event_type = ${eventType}
        AND metadata->>${identifierField} = ${identifierValue}
        AND timestamp > ${windowStart}
    `

    const count = result[0]?.count || 0
    const oldestAttempt = result[0]?.oldest_attempt

    if (count >= maxAttempts) {
      const retryAfterMs = oldestAttempt
        ? (Number(oldestAttempt) + windowMs) - Date.now()
        : windowMs

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
      }
    }

    return {
      allowed: true,
      remaining: maxAttempts - count
    }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open - allow request if rate limit check fails
    return {
      allowed: true,
      remaining: maxAttempts
    }
  }
}

/**
 * Log when rate limit is exceeded (for monitoring)
 */
export function logRateLimitExceeded(
  identifier: string,
  endpoint: string,
  userAgent?: string
): void {
  logEvent({
    eventType: 'RATE_LIMIT_EXCEEDED',
    userAgent,
    metadata: { identifier, endpoint }
  })
}
