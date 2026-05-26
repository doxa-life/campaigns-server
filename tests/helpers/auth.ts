import type postgres from 'postgres'
import { v4 as uuidv4 } from 'uuid'
import * as jwt from 'jsonwebtoken'
import * as bcrypt from 'bcrypt'

export interface AuthHeaders {
  headers: { cookie: string }
}

export interface TestUser {
  id: string
  email: string
  display_name: string
  verified: boolean
  superadmin: boolean
  roles: string[]
}

const SALT_ROUNDS = 10
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing'

/**
 * Create a test user in the database with specified role
 */
export async function createTestUser(
  sql: ReturnType<typeof postgres>,
  options: {
    email?: string
    display_name?: string
    password?: string
    role?: 'admin' | 'people_group_editor' | null
    verified?: boolean
    superadmin?: boolean
  } = {}
): Promise<TestUser> {
  const id = uuidv4()
  const email = options.email || `test-${uuidv4().slice(0, 8)}@example.com`
  const display_name = options.display_name || 'Test User'
  const password = options.password || 'testpassword123'
  const roles = options.role ? [options.role] : []
  const verified = options.verified ?? true
  const superadmin = options.superadmin ?? false
  const token_key = uuidv4()

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  await sql`
    INSERT INTO users (id, email, password, display_name, verified, superadmin, roles, token_key)
    VALUES (${id}, ${email}, ${passwordHash}, ${display_name}, ${verified}, ${superadmin}, ${roles}, ${token_key})
  `

  return {
    id,
    email,
    display_name,
    verified,
    superadmin,
    roles
  }
}

/**
 * Generate a JWT token for a test user
 */
export function generateTestToken(user: TestUser): string {
  const payload = {
    userId: user.id,
    email: user.email,
    display_name: user.display_name
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

/**
 * Get auth headers for a test user
 */
export function getAuthHeaders(user: TestUser): AuthHeaders {
  const token = generateTestToken(user)
  return {
    headers: {
      cookie: `auth-token=${token}`
    }
  }
}

/**
 * Create a test user and return auth headers for that user
 */
export async function createAndLoginUser(
  sql: ReturnType<typeof postgres>,
  role: 'admin' | 'people_group_editor' | null = null,
  options: {
    email?: string
    display_name?: string
    verified?: boolean
    superadmin?: boolean
  } = {}
): Promise<{ user: TestUser; auth: AuthHeaders }> {
  const user = await createTestUser(sql, { ...options, role })
  const auth = getAuthHeaders(user)
  return { user, auth }
}

/**
 * Create an admin user and return auth headers
 */
export async function createAdminUser(
  sql: ReturnType<typeof postgres>,
  options: {
    email?: string
    display_name?: string
  } = {}
): Promise<{ user: TestUser; auth: AuthHeaders }> {
  return createAndLoginUser(sql, 'admin', options)
}

/**
 * Create an editor user and return auth headers
 */
export async function createEditorUser(
  sql: ReturnType<typeof postgres>,
  options: {
    email?: string
    display_name?: string
  } = {}
): Promise<{ user: TestUser; auth: AuthHeaders }> {
  return createAndLoginUser(sql, 'people_group_editor', options)
}

/**
 * Create a user with no role (authenticated but no permissions)
 */
export async function createNoRoleUser(
  sql: ReturnType<typeof postgres>,
  options: {
    email?: string
    display_name?: string
  } = {}
): Promise<{ user: TestUser; auth: AuthHeaders }> {
  return createAndLoginUser(sql, null, options)
}
