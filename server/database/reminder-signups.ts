import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'
import { randomUUID } from 'crypto'
import { calculateNextReminderUtc, calculateNextReminderAfterSend } from '../utils/next-reminder-calculator'

export interface ReminderSignup {
  id: number
  people_group_id: number
  tracking_id: string
  name: string
  email: string
  phone: string
  delivery_method: 'email' | 'whatsapp' | 'app'
  frequency: string
  days_of_week: string | null
  time_preference: string
  prayer_duration: number
  timezone: string
  next_reminder_utc: string | null
  status: 'active' | 'inactive' | 'unsubscribed'
  email_verified: boolean
  verification_token: string | null
  verification_token_expires_at: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateReminderSignupInput {
  people_group_id: number
  name: string
  email?: string
  phone?: string
  delivery_method: 'email' | 'whatsapp' | 'app'
  frequency: string
  days_of_week?: number[]
  time_preference: string
  prayer_duration?: number
  timezone?: string
}

class ReminderSignupService {
  private sql = getSql()

  async createSignup(input: CreateReminderSignupInput): Promise<ReminderSignup> {
    const tracking_id = randomUUID()

    if (input.delivery_method === 'email' && !input.email) {
      throw new Error('Email is required for email delivery')
    }
    if (input.delivery_method === 'whatsapp' && !input.phone) {
      throw new Error('Phone is required for WhatsApp delivery')
    }

    const days_of_week_json = input.days_of_week ? JSON.stringify(input.days_of_week) : null
    const timezone = input.timezone || 'UTC'

    const [row] = await this.sql`
      INSERT INTO reminder_signups (
        people_group_id, tracking_id, name, email, phone,
        delivery_method, frequency, days_of_week, time_preference, prayer_duration, timezone, status
      )
      VALUES (
        ${input.people_group_id}, ${tracking_id}, ${input.name}, ${input.email || ''},
        ${input.phone || ''}, ${input.delivery_method}, ${input.frequency}, ${days_of_week_json},
        ${input.time_preference}, ${input.prayer_duration || 10}, ${timezone}, 'active'
      )
      RETURNING *
    `
    return row
  }

  async getSignupById(id: number): Promise<ReminderSignup | null> {
    const [row] = await this.sql`SELECT * FROM reminder_signups WHERE id = ${id}`
    return row || null
  }

  async getSignupByTrackingId(tracking_id: string): Promise<ReminderSignup | null> {
    const [row] = await this.sql`SELECT * FROM reminder_signups WHERE tracking_id = ${tracking_id}`
    return row || null
  }

  async getPeopleGroupSignups(peopleGroupId: number, options?: {
    status?: 'active' | 'inactive' | 'unsubscribed'
    limit?: number
    offset?: number
  }): Promise<ReminderSignup[]> {
    const status = options?.status || null
    const limit = options?.limit || null
    const offset = options?.offset || null

    if (status && limit) {
      return await this.sql`
        SELECT * FROM reminder_signups
        WHERE people_group_id = ${peopleGroupId} AND status = ${status}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    if (status) {
      return await this.sql`
        SELECT * FROM reminder_signups
        WHERE people_group_id = ${peopleGroupId} AND status = ${status}
        ORDER BY created_at DESC
      `
    }
    if (limit) {
      return await this.sql`
        SELECT * FROM reminder_signups WHERE people_group_id = ${peopleGroupId}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    return await this.sql`
      SELECT * FROM reminder_signups WHERE people_group_id = ${peopleGroupId}
      ORDER BY created_at DESC
    `
  }

  async updateSignupStatus(id: number, status: 'active' | 'inactive' | 'unsubscribed'): Promise<ReminderSignup | null> {
    const [row] = await this.sql`
      UPDATE reminder_signups
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
      RETURNING *
    `
    return row || null
  }

  async unsubscribeByTrackingId(tracking_id: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE reminder_signups
      SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE tracking_id = ${tracking_id}
    `
    return result.count > 0
  }

  async resubscribe(signupId: number): Promise<boolean> {
    const result = await this.sql`
      UPDATE reminder_signups
      SET status = 'active', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${signupId}
    `

    if (result.count > 0) {
      await this.setInitialNextReminder(signupId)
      return true
    }
    return false
  }

  async deleteSignup(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM reminder_signups WHERE id = ${id}`
    return result.count > 0
  }

  async getActiveSignupCount(peopleGroupId: number): Promise<number> {
    const [result] = await this.sql`
      SELECT COUNT(*) as count FROM reminder_signups
      WHERE people_group_id = ${peopleGroupId} AND status = 'active'
    `
    return result.count
  }

  async generateVerificationToken(signupId: number): Promise<string> {
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await this.sql`
      UPDATE reminder_signups
      SET verification_token = ${token}, verification_token_expires_at = ${expiresAt},
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${signupId}
    `
    return token
  }

  async getSignupByVerificationToken(token: string): Promise<ReminderSignup | null> {
    const [row] = await this.sql`SELECT * FROM reminder_signups WHERE verification_token = ${token}`
    return row || null
  }

  isTokenExpired(signup: ReminderSignup): boolean {
    if (!signup.verification_token_expires_at) return true
    return new Date(signup.verification_token_expires_at) < new Date()
  }

  async verifyByToken(token: string): Promise<{ success: boolean; signup?: ReminderSignup; error?: string }> {
    const signup = await this.getSignupByVerificationToken(token)

    if (!signup) return { success: false, error: 'Invalid verification token' }
    if (this.isTokenExpired(signup)) return { success: false, error: 'Verification token has expired' }
    if (signup.email_verified) return { success: true, signup, error: 'Email already verified' }

    await this.sql`
      UPDATE reminder_signups
      SET email_verified = true,
          verified_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          verification_token = NULL,
          verification_token_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${signup.id}
    `

    return { success: true, signup: (await this.getSignupById(signup.id))! }
  }

  async regenerateVerificationToken(signupId: number): Promise<string | null> {
    const signup = await this.getSignupById(signupId)
    if (!signup || signup.email_verified) return null
    return this.generateVerificationToken(signupId)
  }

  async getSignupsDueForReminder(): Promise<ReminderSignup[]> {
    return await this.sql`
      SELECT * FROM reminder_signups
      WHERE next_reminder_utc <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        AND status = 'active'
        AND email_verified = true
        AND delivery_method = 'email'
      ORDER BY next_reminder_utc ASC
    `
  }

  async updateNextReminderUtc(signupId: number, nextUtc: Date): Promise<void> {
    await this.sql`
      UPDATE reminder_signups
      SET next_reminder_utc = ${nextUtc.toISOString()}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${signupId}
    `
  }

  async setInitialNextReminder(signupId: number): Promise<void> {
    const signup = await this.getSignupById(signupId)
    if (!signup) return

    const daysOfWeek = signup.days_of_week ? JSON.parse(signup.days_of_week) : undefined

    const nextUtc = await calculateNextReminderUtc({
      timezone: signup.timezone || 'UTC',
      timePreference: signup.time_preference,
      frequency: signup.frequency,
      daysOfWeek
    })

    await this.updateNextReminderUtc(signupId, nextUtc)
  }

  async setNextReminderAfterSend(signupId: number): Promise<void> {
    const signup = await this.getSignupById(signupId)
    if (!signup) return

    const daysOfWeek = signup.days_of_week ? JSON.parse(signup.days_of_week) : undefined

    const nextUtc = calculateNextReminderAfterSend({
      timezone: signup.timezone || 'UTC',
      timePreference: signup.time_preference,
      frequency: signup.frequency,
      daysOfWeek
    })

    await this.updateNextReminderUtc(signupId, nextUtc)
  }

  async updateSubscriberPreferences(signupId: number, updates: {
    name?: string
    email?: string
    frequency?: string
    days_of_week?: number[]
    time_preference?: string
    timezone?: string
    prayer_duration?: number
  }): Promise<{ signup: ReminderSignup | null; emailChanged: boolean }> {
    const signup = await this.getSignupById(signupId)
    if (!signup) return { signup: null, emailChanged: false }

    const emailChanged = updates.email !== undefined && updates.email !== signup.email
    const scheduleChanged = (
      updates.time_preference !== undefined ||
      updates.timezone !== undefined ||
      updates.frequency !== undefined ||
      updates.days_of_week !== undefined
    )

    const fields: Fragment[] = []

    if (updates.name !== undefined) fields.push(this.sql`name = ${updates.name}`)
    if (updates.email !== undefined) fields.push(this.sql`email = ${updates.email}`)
    if (updates.frequency !== undefined) fields.push(this.sql`frequency = ${updates.frequency}`)
    if (updates.days_of_week !== undefined) fields.push(this.sql`days_of_week = ${JSON.stringify(updates.days_of_week)}`)
    if (updates.time_preference !== undefined) fields.push(this.sql`time_preference = ${updates.time_preference}`)
    if (updates.timezone !== undefined) fields.push(this.sql`timezone = ${updates.timezone}`)
    if (updates.prayer_duration !== undefined) fields.push(this.sql`prayer_duration = ${updates.prayer_duration}`)

    if (emailChanged) {
      fields.push(this.sql`email_verified = ${false}`)
      fields.push(this.sql`verified_at = ${null}`)
    }

    if (fields.length === 0) return { signup, emailChanged: false }

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE reminder_signups SET ${buildSet(this.sql, fields)} WHERE id = ${signupId}`

    if (scheduleChanged) {
      await this.setInitialNextReminder(signupId)
    }

    return {
      signup: await this.getSignupById(signupId),
      emailChanged
    }
  }
}

export const reminderSignupService = new ReminderSignupService()
