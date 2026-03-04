import { getDatabase } from './db'
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
  private db = getDatabase()

  // Create a new user
  async createUser(userData: CreateUserData): Promise<User> {
    const { email, password, display_name = '' } = userData

    // Hash the password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // Generate unique token key
    const tokenKey = randomUUID()

    const stmt = this.db.prepare(`
      INSERT INTO users (email, password, display_name, token_key)
      VALUES (?, ?, ?, ?)
    `)

    try {
      const result = await stmt.run(email, passwordHash, display_name, tokenKey)
      // For UUID primary keys, we need to query back the inserted row
      return (await this.getUserByEmail(email))!
    } catch (error: any) {
      if (error.code === '23505') { // PostgreSQL unique violation
        throw new Error('User with this email already exists')
      }
      throw error
    }
  }

  // Get user by ID
  async getUserById(id: string): Promise<User | null> {
    const stmt = this.db.prepare(`
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users
      WHERE id = ?
    `)

    return await stmt.get(id) as User | null
  }

  // Get user by email
  async getUserByEmail(email: string): Promise<User | null> {
    const stmt = this.db.prepare(`
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users
      WHERE email = ?
    `)

    return await stmt.get(email) as User | null
  }

  // Get all users (for admin purposes)
  async getAllUsers(): Promise<User[]> {
    const stmt = this.db.prepare(`
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users
      ORDER BY created DESC
    `)

    return await stmt.all() as User[]
  }

  // Get all admin users (users with 'admin' role or superadmin flag)
  async getAdminUsers(): Promise<User[]> {
    const stmt = this.db.prepare(`
      SELECT id, email, display_name, verified, superadmin, role, token_key, created, updated, activity_email_preferences
      FROM users
      WHERE role = 'admin' OR superadmin = TRUE
      ORDER BY created DESC
    `)

    return await stmt.all() as User[]
  }

  // Mark user as verified
  async verifyUser(id: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      UPDATE users SET verified = TRUE, updated = NOW()
      WHERE id = ?
    `)

    const result = await stmt.run(id)
    return result.changes > 0
  }
}

// Export singleton instance
export const userService = new UserService()
