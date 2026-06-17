import { getSql } from './db'
import { randomUUID } from 'crypto'
import { doAction } from '../utils/hooks'

// Deliverability suppression reasons. An unsubscribe is NOT here — it's a consent
// signal (see unsubscribeFromMarketing), not a dead/complaining mailbox.
export type SuppressionReason = 'hard_bounce' | 'complaint'

export interface ContactMethod {
  id: number
  // Nullable: registry-only rows record addresses we've interacted with (e.g. a
  // bounced test send) that aren't tied to a subscriber.
  subscriber_id: number | null
  type: 'email' | 'phone'
  value: string
  verified: boolean
  verification_token: string | null
  verification_token_expires_at: string | null
  verified_at: string | null
  consent_doxa_general: boolean
  consent_doxa_general_at: string | null
  consent_product_emails: boolean
  consent_product_emails_at: string | null
  consented_people_group_ids: number[]
  consented_people_group_ids_at: Record<string, string>
  // Deliverability (fed by the Mailgun delivery webhook). suppressed_at null = deliverable.
  suppressed_at: string | null
  suppression_reason: SuppressionReason | null
  suppression_detail: string | null
  bounce_count: number
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
    // Claim a pre-existing registry-only row (e.g. one created by a bounce before
    // this address ever became a subscriber); keep the current owner otherwise.
    const [row] = await this.sql`
      INSERT INTO contact_methods (subscriber_id, type, value)
      VALUES (${subscriberId}, ${type}, ${value})
      ON CONFLICT (type, value) DO UPDATE
        SET subscriber_id = COALESCE(contact_methods.subscriber_id, ${subscriberId}),
            updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
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
      WHERE subscriber_id = ${subscriberId}
        AND type = 'email'
        AND verified = true
        AND suppressed_at IS NULL
      ORDER BY created_at ASC LIMIT 1
    `
    if (verified) return verified as ContactMethod

    const [fallback] = await this.sql`
      SELECT * FROM contact_methods
      WHERE subscriber_id = ${subscriberId}
        AND type = 'email'
        AND suppressed_at IS NULL
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

  /**
   * Ensure the contact method has a usable verification token and return it.
   *
   * One email address has a single shared token, and a subscriber may sign up to
   * several people groups before verifying. Minting a fresh token on every signup
   * would invalidate the links already mailed for earlier signups, so an existing
   * unexpired token is reused — every verification email ever sent during the
   * unverified window keeps working. A new token is minted only when none exists or
   * the current one has expired. The CASE update is atomic so two concurrent signups
   * can't race into two different tokens.
   *
   * `isNew` tells the caller whether this call minted the token (it is the first
   * outstanding verification link for the address), so it can suppress duplicate
   * verification emails for follow-on signups.
   */
  async generateVerificationToken(contactMethodId: number): Promise<{ token: string; isNew: boolean }> {
    const newToken = randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const [row] = await this.sql`
      UPDATE contact_methods
      SET verification_token = CASE
            WHEN verification_token IS NOT NULL
                 AND verification_token_expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
              THEN verification_token ELSE ${newToken} END,
          verification_token_expires_at = CASE
            WHEN verification_token IS NOT NULL
                 AND verification_token_expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
              THEN verification_token_expires_at ELSE ${expiresAt} END,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${contactMethodId}
      RETURNING verification_token
    `
    const token = (row?.verification_token as string) ?? newToken
    return { token, isNew: token === newToken }
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

    const verified = (await this.getById(contactMethod.id))!
    await doAction('contact.verified', verified)
    return { success: true, contactMethod: verified }
  }

  async regenerateVerificationToken(contactMethodId: number): Promise<string | null> {
    const contactMethod = await this.getById(contactMethodId)
    if (!contactMethod || contactMethod.verified) return null
    const { token } = await this.generateVerificationToken(contactMethodId)
    return token
  }

  // Mark a contact method verified directly (used when we receive an authenticated email
  // from the address — proves ownership + reachability). No-op if already verified.
  async markVerified(id: number): Promise<void> {
    const [row] = await this.sql`
      UPDATE contact_methods
      SET verified = true,
          verified_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id} AND verified = false
      RETURNING *
    `
    // Only fires on a real transition — the WHERE clause skips already-verified rows.
    if (row) await doAction('contact.verified', row as ContactMethod)
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

  async updateProductEmailsConsent(id: number, granted: boolean): Promise<ContactMethod | null> {
    await this.sql`
      UPDATE contact_methods
      SET consent_product_emails = ${granted},
          consent_product_emails_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
    return this.getById(id)
  }

  // --- Deliverability / suppression -----------------------------------------

  async isSuppressed(value: string): Promise<boolean> {
    const [row] = await this.sql`
      SELECT 1 FROM contact_methods
      WHERE type = 'email' AND LOWER(value) = LOWER(${value}) AND suppressed_at IS NOT NULL
      LIMIT 1
    `
    return !!row
  }

  /**
   * Mark an address undeliverable (hard bounce / complaint / unsubscribe). Updates
   * every existing row for the address (case-insensitive); if none exists, records a
   * registry-only row (no subscriber). Idempotent — repeats bump bounce_count.
   * Returns the affected row (for activity logging / subscriber resolution).
   */
  async suppressByEmail(value: string, reason: SuppressionReason, detail?: string): Promise<ContactMethod | null> {
    const updated = await this.sql`
      UPDATE contact_methods
      SET suppressed_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          suppression_reason = ${reason},
          suppression_detail = ${detail ?? null},
          bounce_count = bounce_count + 1,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE type = 'email' AND LOWER(value) = LOWER(${value})
      RETURNING *
    `
    if (updated.length > 0) return updated[0] as ContactMethod

    const [inserted] = await this.sql`
      INSERT INTO contact_methods (subscriber_id, type, value, suppressed_at, suppression_reason, suppression_detail, bounce_count)
      VALUES (NULL, 'email', ${value}, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', ${reason}, ${detail ?? null}, 1)
      ON CONFLICT (type, value) DO UPDATE SET
        suppressed_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
        suppression_reason = ${reason},
        suppression_detail = ${detail ?? null},
        bounce_count = contact_methods.bounce_count + 1,
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      RETURNING *
    `
    return (inserted as ContactMethod) ?? null
  }

  /**
   * Opt an address out of all marketing (provider/Mailgun unsubscribe, or our own
   * one-click). Turns off every marketing consent but leaves deliverability
   * (suppressed_at) untouched, so transactional mail — e.g. prayer reminders, which
   * are gated by subscription status, not consent — keeps flowing. Updates existing
   * rows only (no consent record to flip for an unknown address). Returns the row.
   */
  async unsubscribeFromMarketing(value: string): Promise<ContactMethod | null> {
    const rows = await this.sql`
      UPDATE contact_methods
      SET consent_doxa_general = false,
          consent_doxa_general_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          consent_product_emails = false,
          consent_product_emails_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          consented_people_group_ids = '{}',
          consented_people_group_ids_at = '{}',
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE type = 'email' AND LOWER(value) = LOWER(${value})
      RETURNING *
    `
    return (rows[0] as ContactMethod) ?? null
  }

  /** Clear suppression on an address (admin un-suppression of a false positive). */
  async clearSuppressionByEmail(value: string): Promise<ContactMethod | null> {
    const rows = await this.sql`
      UPDATE contact_methods
      SET suppressed_at = NULL, suppression_reason = NULL, suppression_detail = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE type = 'email' AND LOWER(value) = LOWER(${value}) AND suppressed_at IS NOT NULL
      RETURNING *
    `
    return (rows[0] as ContactMethod) ?? null
  }

  /** All currently-suppressed email addresses, with subscriber name when linked. */
  async listSuppressed(): Promise<Array<{
    id: number; value: string; suppression_reason: string | null; suppression_detail: string | null
    suppressed_at: string | null; bounce_count: number; subscriber_id: number | null; subscriber_name: string | null
  }>> {
    return await this.sql`
      SELECT cm.id, cm.value, cm.suppression_reason, cm.suppression_detail,
        cm.suppressed_at, cm.bounce_count, cm.subscriber_id, s.name as subscriber_name
      FROM contact_methods cm
      LEFT JOIN subscribers s ON s.id = cm.subscriber_id
      WHERE cm.type = 'email' AND cm.suppressed_at IS NOT NULL
      ORDER BY cm.suppressed_at DESC
    ` as any
  }

  async getContactsWithDoxaConsent(): Promise<ContactMethod[]> {
    return await this.sql`
      SELECT * FROM contact_methods
      WHERE consent_doxa_general = true AND verified = true AND type = 'email'
      AND suppressed_at IS NULL
      ORDER BY created_at DESC
    `
  }

  // Doxa-consented, verified contacts whose subscriber has an active people group subscription.
  async getContactsWithDoxaConsentAndActiveSubscription(): Promise<ContactMethod[]> {
    return await this.sql`
      SELECT cm.* FROM contact_methods cm
      WHERE cm.type = 'email'
      AND cm.consent_doxa_general = true AND cm.verified = true
      AND cm.suppressed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM campaign_subscriptions cs
        WHERE cs.subscriber_id = cm.subscriber_id AND cs.status = 'active'
      )
      ORDER BY cm.created_at DESC
    `
  }

  // Verified email contacts whose subscriber has an active people group subscription,
  // regardless of Doxa-wide consent. Email-typed only, since there is no consent column
  // implicitly restricting the rows here. Excludes contacts who opted out of the
  // product/feedback email category (surveys, evaluations, product updates).
  async getContactsWithActiveSubscription(): Promise<ContactMethod[]> {
    return await this.sql`
      SELECT cm.* FROM contact_methods cm
      WHERE cm.type = 'email' AND cm.verified = true
      AND cm.consent_product_emails = true
      AND cm.suppressed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM campaign_subscriptions cs
        WHERE cs.subscriber_id = cm.subscriber_id AND cs.status = 'active'
      )
      ORDER BY cm.created_at DESC
    `
  }

  async getEmailContactsByIds(ids: number[]): Promise<ContactMethod[]> {
    if (ids.length === 0) return []
    return await this.sql`
      SELECT * FROM contact_methods
      WHERE id IN ${this.sql(ids)} AND type = 'email'
      AND suppressed_at IS NULL
    `
  }

  // Search verified email contacts by subscriber name or email, for hand-picking recipients.
  async searchEmailContacts(query: string, limit = 20): Promise<Array<{ id: number; value: string; name: string }>> {
    const like = `%${query}%`
    return await this.sql`
      SELECT cm.id, cm.value, s.name
      FROM contact_methods cm
      JOIN subscribers s ON s.id = cm.subscriber_id
      WHERE cm.type = 'email' AND cm.verified = true
        AND (${query} = '' OR cm.value ILIKE ${like} OR s.name ILIKE ${like})
      ORDER BY s.name ASC
      LIMIT ${limit}
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
      WHERE ${peopleGroupId} = ANY(consented_people_group_ids) AND verified = true AND type = 'email'
      AND suppressed_at IS NULL
      ORDER BY created_at DESC
    `
  }

  /**
   * Re-check at send time whether a single contact still consents to this email's
   * audience. Mirrors the consent predicate of the matching audience-selection query
   * above, so a recipient who unsubscribed after the campaign was queued (but before
   * their job drained) is dropped instead of mailed — the CAN-SPAM/GDPR/CASL safety
   * net, paired with the suppression re-check in the processor. Callers must skip this
   * for 'pick' (testing override that bypasses consent) and 'admins' (internal
   * recipients with no contact-method consent row, id 0).
   */
  async stillConsentsToAudience(
    contactMethodId: number,
    audienceType: string,
    peopleGroupId?: number | null
  ): Promise<boolean> {
    const [row] = await this.sql`
      SELECT type, consent_doxa_general, consent_product_emails, consented_people_group_ids
      FROM contact_methods
      WHERE id = ${contactMethodId}
    `
    if (!row) return false
    if (row.type !== 'email') return false
    switch (audienceType) {
      case 'people_group':
        return peopleGroupId != null && (row.consented_people_group_ids ?? []).includes(peopleGroupId)
      case 'active_pg':
        return row.consent_product_emails === true
      case 'doxa':
      case 'doxa_active_pg':
        return row.consent_doxa_general === true
      default:
        return true
    }
  }
}

export const contactMethodService = new ContactMethodService()
