import type { H3Event } from 'h3'
import jwt from 'jsonwebtoken'
import { roleService } from '#server/database/roles'

export interface JWTPayload {
  userId: number
  email: string
  display_name?: string
}

export interface UserWithRoles {
  id: number
  email: string
  display_name: string
  verified: boolean
  roles: string[]
  isAdmin: boolean
  isSuperAdmin: boolean
}

// Authenticate via API key (set by api-key-auth middleware) or JWT cookie.
// Uses a unique name to avoid conflicting with the base layer's auto-imported requireAuth.
export function checkAuth(event: H3Event) {
  if (event.context.apiKeyAuth) {
    return event.context.apiKeyAuth as { userId: string; email: string; display_name: string }
  }
  return requireAuth(event)
}

export async function requireAdmin(event: H3Event) {
  const user = checkAuth(event)

  const isAdmin = await roleService.isAdmin(user.userId)
  if (!isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required'
    })
  }

  return user
}

export async function requireSuperAdmin(event: H3Event) {
  const user = checkAuth(event)

  const { userService } = await import('#server/database/users')
  const dbUser = await userService.getUserById(user.userId)
  if (!dbUser?.superadmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Superadmin access required'
    })
  }

  return user
}

export async function requirePermission(event: H3Event, permission: string) {
  const user = checkAuth(event)

  // Check if user has the required permission
  const hasPermission = await roleService.userHasPermission(user.userId, permission)

  if (!hasPermission) {
    throw createError({
      statusCode: 403,
      statusMessage: `Permission required: ${permission}`
    })
  }

  return user
}

// Generate JWT token
export function generateToken(payload: JWTPayload): string {
  const config = useRuntimeConfig()
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' })
}

// Set auth cookie
export function setAuthCookie(event: H3Event, token: string) {
  setCookie(event, 'auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  })
}

// Get user with their role
export async function getUserWithRoles(userId: string, userEmail: string, displayName: string, verified: boolean, superadmin: boolean): Promise<UserWithRoles> {
  const roles = await roleService.getUserRoles(userId)
  const isAdmin = roles.includes('admin')

  return {
    id: userId as any, // Keep as any for backward compatibility
    email: userEmail,
    display_name: displayName,
    verified,
    roles,
    isAdmin,
    isSuperAdmin: superadmin
  }
}
