import { getSql } from './db'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

export interface User {
  id: string // UUID
  email: string
  display_name: string
  verified: boolean
  superadmin: boolean
  role: string | null
  token_key: string
  created: string
  updated: string
  activity_email_preferences: { daily: boolean; weekly: boolean; monthly: boolean; yearly: boolean } | null
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
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users WHERE id = ${id}
    `
    return (row as User) ?? null
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.sql`
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users WHERE email = ${email}
    `
    return (row as User) ?? null
  }

  async getAllUsers(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users ORDER BY created DESC
    ` as any
  }

  async getAdminUsers(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users WHERE role = 'admin' OR superadmin = TRUE ORDER BY created DESC
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
