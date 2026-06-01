import { sql } from './database'
import crypto from 'crypto'
import type { H3Event } from 'h3'
import { getAuthUser } from './auth'

interface LogEventOptions {
  eventType: string
  tableName?: string
  recordId?: string
  userId?: string
  userAgent?: string
  metadata?: Record<string, any>
}

/**
 * Core function to log an activity event
 */
export async function logEvent(options: LogEventOptions): Promise<void> {
  try {
    const id = crypto.randomUUID()
    const timestamp = Date.now()

    await sql`
      INSERT INTO activity_logs (
        id, timestamp, event_type, table_name, record_id, user_id, user_agent, metadata
      ) VALUES (
        ${id},
        ${timestamp},
        ${options.eventType},
        ${options.tableName || null},
        ${options.recordId || null},
        ${options.userId || null},
        ${options.userAgent || null},
        ${options.metadata || {}}
      )
    `
  } catch (error) {
    // Log error but don't throw - logging should never break the main flow
    console.error('Failed to log activity:', error)
  }
}

/**
 * Helper to extract user info from H3Event
 */
function getUserInfoFromEvent(event: H3Event | null): { userId?: string; userAgent?: string } {
  if (!event) return {}

  const user = getAuthUser(event)
  const userAgent = getHeader(event, 'user-agent') || undefined

  return {
    userId: user?.userId,
    userAgent
  }
}

/**
 * Log a CREATE event
 */
export function logCreate(
  tableName: string,
  recordId: string,
  userIdOrEvent?: string | H3Event,
  metadata?: any
): void {
  let userId: string | undefined
  let userAgent: string | undefined

  if (typeof userIdOrEvent === 'string') {
    userId = userIdOrEvent
  } else if (userIdOrEvent) {
    const info = getUserInfoFromEvent(userIdOrEvent)
    userId = info.userId
    userAgent = info.userAgent
  }

  logEvent({
    eventType: 'CREATE',
    tableName,
    recordId,
    userId,
    userAgent,
    metadata
  })
}

/**
 * Log an UPDATE event
 */
export function logUpdate(
  tableName: string,
  recordId: string,
  userIdOrEvent?: string | H3Event,
  metadata?: any
): void {
  let userId: string | undefined
  let userAgent: string | undefined

  if (typeof userIdOrEvent === 'string') {
    userId = userIdOrEvent
  } else if (userIdOrEvent) {
    const info = getUserInfoFromEvent(userIdOrEvent)
    userId = info.userId
    userAgent = info.userAgent
  }

  logEvent({
    eventType: 'UPDATE',
    tableName,
    recordId,
    userId,
    userAgent,
    metadata
  })
}

/**
 * Log a DELETE event
 */
export function logDelete(
  tableName: string,
  recordId: string,
  userIdOrEvent?: string | H3Event,
  metadata?: any
): void {
  let userId: string | undefined
  let userAgent: string | undefined

  if (typeof userIdOrEvent === 'string') {
    userId = userIdOrEvent
  } else if (userIdOrEvent) {
    const info = getUserInfoFromEvent(userIdOrEvent)
    userId = info.userId
    userAgent = info.userAgent
  }

  logEvent({
    eventType: 'DELETE',
    tableName,
    recordId,
    userId,
    userAgent,
    metadata
  })
}

/**
 * Log a successful LOGIN event
 */
export function logLogin(
  userId: string,
  userAgent?: string,
  metadata?: any
): void {
  logEvent({
    eventType: 'LOGIN',
    userId,
    userAgent,
    metadata
  })
}

/**
 * Log a failed LOGIN attempt
 * Note: email must be stored in metadata.email for privacy
 */
export function logLoginFailed(
  email: string,
  userAgent?: string,
  metadata?: any
): void {
  logEvent({
    eventType: 'LOGIN_FAILED',
    userAgent,
    metadata: {
      ...metadata,
      email
    }
  })
}

/**
 * Log a LOGOUT event
 */
export function logLogout(
  userId: string,
  userAgent?: string,
  metadata?: any
): void {
  logEvent({
    eventType: 'LOGOUT',
    userId,
    userAgent,
    metadata
  })
}

/**
 * Log a PASSWORD_RESET event
 */
export function logPasswordReset(
  userId: string,
  userAgent?: string,
  metadata?: any
): void {
  logEvent({
    eventType: 'PASSWORD_RESET',
    userId,
    userAgent,
    metadata
  })
}

/**
 * Log an EMAIL_CHANGE event
 */
export function logEmailChange(
  userId: string,
  userAgent?: string,
  metadata?: any
): void {
  logEvent({
    eventType: 'EMAIL_CHANGE',
    userId,
    userAgent,
    metadata
  })
}

/**
 * Log a registration attempt (for rate limiting by IP)
 */
export function logRegisterAttempt(
  ip: string,
  userAgent?: string,
  metadata?: any
): void {
  logEvent({
    eventType: 'REGISTER_ATTEMPT',
    userAgent,
    metadata: { ...metadata, ip }
  })
}

/**
 * Log a password reset request (for rate limiting by email)
 */
export function logPasswordResetRequest(
  email: string,
  userAgent?: string,
  metadata?: any
): void {
  logEvent({
    eventType: 'PASSWORD_RESET_REQUEST',
    userAgent,
    metadata: { ...metadata, email }
  })
}
