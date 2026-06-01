import { getSql } from './db'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

export interface User {
  id: string // UUID
  email: string
  display_name: string
  verified: boolean
  superadmin: boolean
  roles: string[]
  token_key: string
  created: string
  updated: string
  activity_email_preferences: { daily: boolean; weekly: boolean; monthly: boolean; yearly: boolean } | null
  email_alias: string | null
  email_signature: string | null
}

export interface CreateUserData {
  email: string
  password: string
  display_name?: string
}

const SALT_ROUNDS = 12

export class UserService {
  private sql = getSql()

  async createUser(userData: CreateUserData): Promise<User> {
    const { email, password, display_name = '' } = userData

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const tokenKey = randomUUID()

    try {
      await this.sql`
        INSERT INTO users (email, password, display_name, token_key)
        VALUES (${email}, ${passwordHash}, ${display_name}, ${tokenKey})
      `
      return (await this.getUserByEmail(email))!
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('User with this email already exists')
      }
      throw error
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const [row] = await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, activity_email_preferences, email_alias, email_signature
      FROM users WHERE id = ${id}
    `
    return (row as User) ?? null
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, activity_email_preferences, email_alias, email_signature
      FROM users WHERE email = ${email}
    `
    return (row as User) ?? null
  }

  async getAllUsers(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, activity_email_preferences, email_alias, email_signature
      FROM users ORDER BY created DESC
    ` as any
  }

  // Look up a user by their inbox sending alias (local-part only, e.g. 'george')
  async getByEmailAlias(alias: string): Promise<User | null> {
    if (!alias) return null
    const [row] = await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, activity_email_preferences, email_alias, email_signature
      FROM users WHERE LOWER(email_alias) = LOWER(${alias})
    `
    return (row as User) ?? null
  }

  // Set the inbox sending identity (alias = local-part only) and HTML signature. Pass undefined to leave a field unchanged.
  async updateInboxIdentity(id: string, updates: { email_alias?: string | null; email_signature?: string | null }): Promise<User | null> {
    if (updates.email_alias !== undefined) {
      const alias = updates.email_alias ? updates.email_alias.trim().toLowerCase() : null
      await this.sql`UPDATE users SET email_alias = ${alias}, updated = NOW() WHERE id = ${id}`
    }
    if (updates.email_signature !== undefined) {
      await this.sql`UPDATE users SET email_signature = ${updates.email_signature ?? null}, updated = NOW() WHERE id = ${id}`
    }
    return this.getUserById(id)
  }

  async getAdminUsers(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, activity_email_preferences
      FROM users WHERE 'admin' = ANY(roles) OR superadmin = TRUE ORDER BY created DESC
    ` as any
  }

  // Users whose roles include any of the given role names (used to enumerate inbox staff)
  async getUsersWithRoles(roleNames: string[]): Promise<User[]> {
    if (roleNames.length === 0) return []
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, activity_email_preferences, email_alias, email_signature
      FROM users WHERE roles && ${roleNames}::text[]
    ` as any
  }

  async verifyUser(id: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE users SET verified = TRUE, updated = NOW()
      WHERE id = ${id}
    `
    return result.count > 0
  }
}

export const userService = new UserService()
