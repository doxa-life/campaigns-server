import type { H3Event } from 'h3'
import jwt from 'jsonwebtoken'
import { roleService } from '#server/database/roles'

export interface JWTPayload {
  userId: string
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

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, useRuntimeConfig().jwtSecret) as { userId: string; email: string; display_name: string }
  } catch {
    return null
  }
}

export function requireAuth(event: H3Event) {
  const token = getCookie(event, 'auth-token')
  const user = token ? verifyToken(token) : null

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  return user
}

export function getAuthUser(event: H3Event) {
  const token = getCookie(event, 'auth-token')
  return token ? verifyToken(token) : null
}

// Authenticate via API key (set by api-key-auth middleware) or JWT cookie.
// Keeps the project-specific API-key path while sharing JWT cookie auth.
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

/**
 * Require the full, unscoped permission. A user who only holds the `_scoped`
 * variant (e.g. a people group editor with `subscribers.delete_scoped`) is
 * rejected. Use for destructive actions that span beyond a single scoped
 * resource, where partial scoped authority is not enough.
 */
export async function requireUnscopedPermission(event: H3Event, permission: string) {
  const user = await requirePermission(event, permission)

  if (await roleService.isPermissionScoped(user.userId, permission)) {
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
