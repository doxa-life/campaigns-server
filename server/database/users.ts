import { getSql } from './db'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

export type NotificationPreferences = {
  stats: { daily: boolean; weekly: boolean; monthly: boolean; yearly: boolean }
  adoption: boolean
  contact_us: boolean
}

// Opt-in by default: a user receives nothing until an admin (or the user, for stats)
// turns a notification on. Eligibility still gates stats on top of this. This is the
// single source of truth for defaults — the column only persists explicit choices, so
// adding a preference or changing a default happens here, with no migration.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  stats: { daily: false, weekly: false, monthly: false, yearly: false },
  adoption: false,
  contact_us: false,
}

// Merge a stored value (possibly null, or missing newer keys) over the defaults above.
// Always read preferences through this so unset keys fall back to code defaults.
export function resolveNotificationPreferences(
  stored: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences {
  const s = (stored && typeof stored === 'object') ? stored : {}
  return {
    stats: { ...DEFAULT_NOTIFICATION_PREFERENCES.stats, ...(s.stats ?? {}) },
    adoption: typeof s.adoption === 'boolean' ? s.adoption : DEFAULT_NOTIFICATION_PREFERENCES.adoption,
    contact_us: typeof s.contact_us === 'boolean' ? s.contact_us : DEFAULT_NOTIFICATION_PREFERENCES.contact_us,
  }
}

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
  notification_preferences: NotificationPreferences | null
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
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences, email_alias, email_signature
      FROM users WHERE id = ${id}
    `
    return (row as User) ?? null
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences, email_alias, email_signature
      FROM users WHERE email = ${email}
    `
    return (row as User) ?? null
  }

  async getAllUsers(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences, email_alias, email_signature
      FROM users ORDER BY created DESC
    ` as any
  }

  // Look up a user by their inbox sending alias (local-part only, e.g. 'george')
  async getByEmailAlias(alias: string): Promise<User | null> {
    if (!alias) return null
    const [row] = await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences, email_alias, email_signature
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

  // Update core account fields. Pass undefined to leave a field unchanged.
  async updateUser(id: string, updates: { email?: string; display_name?: string; verified?: boolean }): Promise<User | null> {
    if (updates.email !== undefined) {
      await this.sql`UPDATE users SET email = ${updates.email.trim()}, updated = NOW() WHERE id = ${id}`
    }
    if (updates.display_name !== undefined) {
      await this.sql`UPDATE users SET display_name = ${updates.display_name.trim()}, updated = NOW() WHERE id = ${id}`
    }
    if (updates.verified !== undefined) {
      await this.sql`UPDATE users SET verified = ${updates.verified}, updated = NOW() WHERE id = ${id}`
    }
    return this.getUserById(id)
  }

  // Users eligible to receive scheduled stats summary emails: admins, progress admins, and superadmins.
  async getStatsEligibleUsers(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences
      FROM users
      WHERE 'admin' = ANY(roles) OR 'progress_admin' = ANY(roles) OR superadmin = TRUE
      ORDER BY created DESC
    ` as any
  }

  // Users opted in to adoption-form notifications.
  async getUsersOptedIntoAdoption(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences, email_alias, email_signature
      FROM users WHERE notification_preferences->>'adoption' = 'true'
    ` as any
  }

  // Users opted in to contact-us / inbox notifications.
  async getUsersOptedIntoContactUs(): Promise<User[]> {
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences, email_alias, email_signature
      FROM users WHERE notification_preferences->>'contact_us' = 'true'
    ` as any
  }

  // Replace a user's notification preferences (stats frequencies + adoption/contact_us opt-ins).
  async updateNotificationPreferences(id: string, prefs: NotificationPreferences): Promise<User | null> {
    await this.sql`
      UPDATE users SET notification_preferences = ${this.sql.json(prefs)}, updated = NOW()
      WHERE id = ${id}
    `
    return this.getUserById(id)
  }

  // Users whose roles include any of the given role names (used to enumerate inbox staff)
  async getUsersWithRoles(roleNames: string[]): Promise<User[]> {
    if (roleNames.length === 0) return []
    return await this.sql`
      SELECT id, email, display_name, verified, superadmin, roles, token_key, created, updated, notification_preferences, email_alias, email_signature
      FROM users WHERE roles && ${roleNames}::text[]
    ` as any
  }

  // Delete a user account. Audit-trail columns referencing the user (marketing email
  // sent_by/updated_by, sender created_by, report reviewed_by) are nulled so they don't
  // block the delete; rows owned via ON DELETE CASCADE (invitations, API keys,
  // people-group assignments, languages) are removed by the database. Throws the
  // foreign-key violation if the user still owns rows that cannot be detached
  // (e.g. marketing emails they created).
  async deleteUser(id: string): Promise<boolean> {
    return await this.sql.begin(async (sql) => {
      await sql`UPDATE marketing_emails SET updated_by = NULL WHERE updated_by = ${id}`
      await sql`UPDATE marketing_emails SET sent_by = NULL WHERE sent_by = ${id}`
      await sql`UPDATE marketing_senders SET created_by = NULL WHERE created_by = ${id}`
      await sql`UPDATE people_group_reports SET reviewed_by = NULL WHERE reviewed_by = ${id}`
      const result = await sql`DELETE FROM users WHERE id = ${id}`
      return result.count > 0
    })
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
