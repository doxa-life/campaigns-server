import { getDatabase } from './db'
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
  private db = getDatabase()

  async addContactMethod(
    subscriberId: number,
    type: 'email' | 'phone',
    value: string
  ): Promise<ContactMethod> {
    const stmt = this.db.prepare(`
      INSERT INTO contact_methods (subscriber_id, type, value)
      VALUES (?, ?, ?)
    `)

    const result = await stmt.run(subscriberId, type, value)
    return (await this.getById(result.lastInsertRowid as number))!
  }

  async getById(id: number): Promise<ContactMethod | null> {
    const stmt = this.db.prepare('SELECT * FROM contact_methods WHERE id = ?')
    return await stmt.get(id) as ContactMethod | null
  }

  /**
   * Get a contact method by type and value (case-insensitive for email)
   */
  async getByValue(type: 'email' | 'phone', value: string): Promise<ContactMethod | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM contact_methods
      WHERE type = ? AND LOWER(value) = LOWER(?)
    `)
    return await stmt.get(type, value) as ContactMethod | null
  }

  async getSubscriberContactMethods(subscriberId: number): Promise<ContactMethod[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ?
      ORDER BY type, created_at
    `)
    return await stmt.all(subscriberId) as ContactMethod[]
  }

  /**
   * Get the primary email for a subscriber (first verified, or first unverified if none verified)
   */
  async getPrimaryEmail(subscriberId: number): Promise<ContactMethod | null> {
    // First try to get a verified email
    const verifiedStmt = this.db.prepare(`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ? AND type = 'email' AND verified = true
      ORDER BY created_at ASC
      LIMIT 1
    `)
    const verified = await verifiedStmt.get(subscriberId) as ContactMethod | null
    if (verified) return verified

    // Fall back to any email
    const anyStmt = this.db.prepare(`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ? AND type = 'email'
      ORDER BY created_at ASC
      LIMIT 1
    `)
    return await anyStmt.get(subscriberId) as ContactMethod | null
  }

  /**
   * Get the primary phone for a subscriber
   */
  async getPrimaryPhone(subscriberId: number): Promise<ContactMethod | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ? AND type = 'phone'
      ORDER BY verified DESC, created_at ASC
      LIMIT 1
    `)
    return await stmt.get(subscriberId) as ContactMethod | null
  }

  async updateContactMethod(
    id: number,
    updates: { value?: string }
  ): Promise<ContactMethod | null> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.value !== undefined) {
      fields.push('value = ?')
      values.push(updates.value)
      // Reset verification when value changes
      fields.push('verified = false')
      fields.push('verified_at = NULL')
      fields.push('verification_token = NULL')
      fields.push('verification_token_expires_at = NULL')
    }

    if (fields.length === 0) {
      return this.getById(id)
    }

    fields.push("updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE contact_methods
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    await stmt.run(...values)

    return this.getById(id)
  }

  async removeContactMethod(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM contact_methods WHERE id = ?')
    const result = await stmt.run(id)
    return result.changes > 0
  }

  /**
   * Generate a verification token for a contact method (7 day expiry)
   */
  async generateVerificationToken(contactMethodId: number): Promise<string> {
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const stmt = this.db.prepare(`
      UPDATE contact_methods
      SET verification_token = ?, verification_token_expires_at = ?, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(token, expiresAt, contactMethodId)

    return token
  }

  /**
   * Get contact method by verification token
   */
  async getByVerificationToken(token: string): Promise<ContactMethod | null> {
    const stmt = this.db.prepare('SELECT * FROM contact_methods WHERE verification_token = ?')
    return await stmt.get(token) as ContactMethod | null
  }

  /**
   * Check if verification token is expired
   */
  isTokenExpired(contactMethod: ContactMethod): boolean {
    if (!contactMethod.verification_token_expires_at) return true
    return new Date(contactMethod.verification_token_expires_at) < new Date()
  }

  /**
   * Verify a contact method by token
   */
  async verifyByToken(token: string): Promise<{
    success: boolean
    contactMethod?: ContactMethod
    alreadyVerified?: boolean
    error?: string
  }> {
    const contactMethod = await this.getByVerificationToken(token)

    if (!contactMethod) {
      return { success: false, error: 'Invalid verification token' }
    }

    if (contactMethod.verified) {
      return { success: true, contactMethod, alreadyVerified: true }
    }

    if (this.isTokenExpired(contactMethod)) {
      return { success: false, error: 'Verification token has expired' }
    }

    // Mark as verified
    const stmt = this.db.prepare(`
      UPDATE contact_methods
      SET verified = true,
          verified_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(contactMethod.id)

    return { success: true, contactMethod: (await this.getById(contactMethod.id))! }
  }

  /**
   * Regenerate verification token (for resend functionality)
   */
  async regenerateVerificationToken(contactMethodId: number): Promise<string | null> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod || contactMethod.verified) {
      return null
    }
    return this.generateVerificationToken(contactMethodId)
  }

  /**
   * Check if a subscriber has a verified email
   */
  async hasVerifiedEmail(subscriberId: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT 1 FROM contact_methods
      WHERE subscriber_id = ? AND type = 'email' AND verified = true
      LIMIT 1
    `)
    const result = await stmt.get(subscriberId)
    return !!result
  }

  /**
   * Update Doxa general consent for a contact method
   */
  async updateDoxaConsent(id: number, granted: boolean): Promise<ContactMethod | null> {
    const stmt = this.db.prepare(`
      UPDATE contact_methods
      SET consent_doxa_general = ?,
          consent_doxa_general_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(granted, id)
    return this.getById(id)
  }

  /**
   * Get all contact methods with Doxa general consent granted
   */
  async getContactsWithDoxaConsent(): Promise<ContactMethod[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM contact_methods
      WHERE consent_doxa_general = true AND verified = true
      ORDER BY created_at DESC
    `)
    return await stmt.all() as ContactMethod[]
  }

  /**
   * Add people group consent for a contact method
   */
  async addPeopleGroupConsent(contactMethodId: number, peopleGroupId: number): Promise<ContactMethod | null> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod) return null

    const currentIds = contactMethod.consented_people_group_ids || []
    if (currentIds.includes(peopleGroupId)) {
      return contactMethod
    }

    const newIds = [...currentIds, peopleGroupId]
    let timestamps = contactMethod.consented_people_group_ids_at || {}
    if (typeof timestamps === 'string') {
      try { timestamps = JSON.parse(timestamps) } catch { timestamps = {} }
    }
    timestamps[String(peopleGroupId)] = new Date().toISOString()

    const pgArrayLiteral = `{${newIds.join(',')}}`

    const stmt = this.db.prepare(`
      UPDATE contact_methods
      SET consented_people_group_ids = ?,
          consented_people_group_ids_at = ?,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(pgArrayLiteral, timestamps, contactMethodId)

    return this.getById(contactMethodId)
  }

  /**
   * Remove people group consent for a contact method
   */
  async removePeopleGroupConsent(contactMethodId: number, peopleGroupId: number): Promise<ContactMethod | null> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod) return null

    const currentIds = contactMethod.consented_people_group_ids || []
    if (!currentIds.includes(peopleGroupId)) {
      return contactMethod
    }

    const newIds = currentIds.filter(id => id !== peopleGroupId)
    let timestamps = contactMethod.consented_people_group_ids_at || {}
    if (typeof timestamps === 'string') {
      try { timestamps = JSON.parse(timestamps) } catch { timestamps = {} }
    }
    delete timestamps[String(peopleGroupId)]

    const pgArrayLiteral = `{${newIds.join(',')}}`

    const stmt = this.db.prepare(`
      UPDATE contact_methods
      SET consented_people_group_ids = ?,
          consented_people_group_ids_at = ?,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(pgArrayLiteral, timestamps, contactMethodId)

    return this.getById(contactMethodId)
  }

  /**
   * Check if a contact method has consented to people group updates
   */
  async hasConsentedToPeopleGroup(contactMethodId: number, peopleGroupId: number): Promise<boolean> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod) return false

    const consentedIds = contactMethod.consented_people_group_ids || []
    return consentedIds.includes(peopleGroupId)
  }

  /**
   * Get all contact methods that have consented to a specific people group's updates
   */
  async getContactsConsentedToPeopleGroup(peopleGroupId: number): Promise<ContactMethod[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM contact_methods
      WHERE ? = ANY(consented_people_group_ids) AND verified = true
      ORDER BY created_at DESC
    `)
    return await stmt.all(peopleGroupId) as ContactMethod[]
  }
}

export const contactMethodService = new ContactMethodService()
