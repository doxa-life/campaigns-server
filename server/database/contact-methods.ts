import { getSql } from './db'
import { randomUUID } from 'crypto'

export interface ContactMethod {
  id: number
  subscriber_id: number
  type: 'email' | 'phone'
  value: string
  verified: boolean
  verification_token: string | null
  verification_token_expires_at: string | null
  verified_at: string | null
  consent_doxa_general: boolean
  consent_doxa_general_at: string | null
  consented_people_group_ids: number[]
  consented_people_group_ids_at: Record<string, string>
  created_at: string
  updated_at: string
}

class ContactMethodService {
  private sql = getSql()

  async addContactMethod(
    subscriberId: number,
    type: 'email' | 'phone',
    value: string
  ): Promise<ContactMethod> {
    const [row] = await this.sql`
      INSERT INTO contact_methods (subscriber_id, type, value)
      VALUES (${subscriberId}, ${type}, ${value})
      RETURNING *
    `
    return row as ContactMethod
  }

  async getById(id: number): Promise<ContactMethod | null> {
    const [row] = await this.sql`SELECT * FROM contact_methods WHERE id = ${id}`
    return (row as ContactMethod) ?? null
  }

  async getByValue(type: 'email' | 'phone', value: string): Promise<ContactMethod | null> {
    const [row] = await this.sql`
      SELECT * FROM contact_methods
      WHERE type = ${type} AND LOWER(value) = LOWER(${value})
    `
    return (row as ContactMethod) ?? null
  }

  async getSubscriberContactMethods(subscriberId: number): Promise<ContactMethod[]> {
    return await this.sql`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ${subscriberId}
      ORDER BY type, created_at
    ` as any
  }

  async getPrimaryEmail(subscriberId: number): Promise<ContactMethod | null> {
    const [verified] = await this.sql`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ${subscriberId} AND type = 'email' AND verified = true
      ORDER BY created_at ASC LIMIT 1
    `
    if (verified) return verified as ContactMethod

    const [fallback] = await this.sql`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ${subscriberId} AND type = 'email'
      ORDER BY created_at ASC LIMIT 1
    `
    return (fallback as ContactMethod) ?? null
  }

  async getPrimaryPhone(subscriberId: number): Promise<ContactMethod | null> {
    const [row] = await this.sql`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ${subscriberId} AND type = 'phone'
      ORDER BY verified DESC, created_at ASC LIMIT 1
    `
    return (row as ContactMethod) ?? null
  }

  async updateContactMethod(
    id: number,
    updates: { value?: string }
  ): Promise<ContactMethod | null> {
    if (updates.value === undefined) return this.getById(id)

    await this.sql`
      UPDATE contact_methods
      SET value = ${updates.value},
          verified = false,
          verified_at = NULL,
          verification_token = NULL,
          verification_token_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
    return this.getById(id)
  }

  async removeContactMethod(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM contact_methods WHERE id = ${id}`
    return result.count > 0
  }

  async generateVerificationToken(contactMethodId: number): Promise<string> {
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await this.sql`
      UPDATE contact_methods
      SET verification_token = ${token}, verification_token_expires_at = ${expiresAt},
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${contactMethodId}
    `
    return token
  }

  async getByVerificationToken(token: string): Promise<ContactMethod | null> {
    const [row] = await this.sql`SELECT * FROM contact_methods WHERE verification_token = ${token}`
    return (row as ContactMethod) ?? null
  }

  isTokenExpired(contactMethod: ContactMethod): boolean {
    if (!contactMethod.verification_token_expires_at) return true
    return new Date(contactMethod.verification_token_expires_at) < new Date()
  }

  async verifyByToken(token: string): Promise<{
    success: boolean
    contactMethod?: ContactMethod
    alreadyVerified?: boolean
    error?: string
  }> {
    const contactMethod = await this.getByVerificationToken(token)

    if (!contactMethod) return { success: false, error: 'Invalid verification token' }
    if (contactMethod.verified) return { success: true, contactMethod, alreadyVerified: true }
    if (this.isTokenExpired(contactMethod)) return { success: false, error: 'Verification token has expired' }

    await this.sql`
      UPDATE contact_methods
      SET verified = true,
          verified_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${contactMethod.id}
    `

    return { success: true, contactMethod: (await this.getById(contactMethod.id))! }
  }

  async regenerateVerificationToken(contactMethodId: number): Promise<string | null> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod || contactMethod.verified) return null
    return this.generateVerificationToken(contactMethodId)
  }

  async hasVerifiedEmail(subscriberId: number): Promise<boolean> {
    const [row] = await this.sql`
      SELECT 1 FROM contact_methods
      WHERE subscriber_id = ${subscriberId} AND type = 'email' AND verified = true
      LIMIT 1
    `
    return !!row
  }

  async updateDoxaConsent(id: number, granted: boolean): Promise<ContactMethod | null> {
    await this.sql`
      UPDATE contact_methods
      SET consent_doxa_general = ${granted},
          consent_doxa_general_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
    return this.getById(id)
  }

  async getContactsWithDoxaConsent(): Promise<ContactMethod[]> {
    return await this.sql`
      SELECT * FROM contact_methods
      WHERE consent_doxa_general = true AND verified = true
      ORDER BY created_at DESC
    `
  }

  async addPeopleGroupConsent(contactMethodId: number, peopleGroupId: number): Promise<ContactMethod | null> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod) return null

    const currentIds = contactMethod.consented_people_group_ids || []
    if (currentIds.includes(peopleGroupId)) return contactMethod

    const newIds = [...currentIds, peopleGroupId]
    let timestamps = contactMethod.consented_people_group_ids_at || {}
    if (typeof timestamps === 'string') {
      try { timestamps = JSON.parse(timestamps) } catch { timestamps = {} }
    }
    timestamps[String(peopleGroupId)] = new Date().toISOString()

    await this.sql`
      UPDATE contact_methods
      SET consented_people_group_ids = ${newIds},
          consented_people_group_ids_at = ${this.sql.json(timestamps)},
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${contactMethodId}
    `
    return this.getById(contactMethodId)
  }

  async removePeopleGroupConsent(contactMethodId: number, peopleGroupId: number): Promise<ContactMethod | null> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod) return null

    const currentIds = contactMethod.consented_people_group_ids || []
    if (!currentIds.includes(peopleGroupId)) return contactMethod

    const newIds = currentIds.filter(id => id !== peopleGroupId)
    let timestamps = contactMethod.consented_people_group_ids_at || {}
    if (typeof timestamps === 'string') {
      try { timestamps = JSON.parse(timestamps) } catch { timestamps = {} }
    }
    delete timestamps[String(peopleGroupId)]

    await this.sql`
      UPDATE contact_methods
      SET consented_people_group_ids = ${newIds},
          consented_people_group_ids_at = ${this.sql.json(timestamps)},
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${contactMethodId}
    `
    return this.getById(contactMethodId)
  }

  async hasConsentedToPeopleGroup(contactMethodId: number, peopleGroupId: number): Promise<boolean> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod) return false
    const consentedIds = contactMethod.consented_people_group_ids || []
    return consentedIds.includes(peopleGroupId)
  }

  async getContactsConsentedToPeopleGroup(peopleGroupId: number): Promise<ContactMethod[]> {
    return await this.sql`
      SELECT * FROM contact_methods
      WHERE ${peopleGroupId} = ANY(consented_people_group_ids) AND verified = true
      ORDER BY created_at DESC
    `
  }
}

export const contactMethodService = new ContactMethodService()
