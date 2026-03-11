import { getDatabase } from './db'
import { randomUUID } from 'crypto'
import { contactMethodService } from './contact-methods'
import { peopleGroupSubscriptionService, type PeopleGroupSubscriptionWithDetails } from './people-group-subscriptions'

export interface Subscriber {
  id: number
  tracking_id: string
  profile_id: string
  name: string
  preferred_language: string
  role: string | null
  created_at: string
  updated_at: string
}

export interface SubscriberWithContacts extends Subscriber {
  contacts: {
    id: number
    type: 'email' | 'phone'
    value: string
    verified: boolean
  }[]
}

export interface SubscriberConsents {
  doxa_general: boolean
  doxa_general_at: string | null
  people_group_ids: number[]
  people_group_names: string[]
}

export interface SubscriberWithSubscriptions extends SubscriberWithContacts {
  primary_email: string | null
  primary_phone: string | null
  subscriptions: PeopleGroupSubscriptionWithDetails[]
  consents: SubscriberConsents
}

class SubscriberService {
  private db = getDatabase()

  async createSubscriber(name: string, language: string = 'en'): Promise<Subscriber> {
    const tracking_id = randomUUID()
    const profile_id = randomUUID()

    const stmt = this.db.prepare(`
      INSERT INTO subscribers (tracking_id, profile_id, name, preferred_language)
      VALUES (?, ?, ?, ?)
    `)

    const result = await stmt.run(tracking_id, profile_id, name, language)
    return (await this.getSubscriberById(result.lastInsertRowid as number))!
  }

  async getSubscriberById(id: number): Promise<Subscriber | null> {
    const stmt = this.db.prepare('SELECT * FROM subscribers WHERE id = ?')
    return await stmt.get(id) as Subscriber | null
  }

  async getSubscriberByTrackingId(trackingId: string): Promise<Subscriber | null> {
    const stmt = this.db.prepare('SELECT * FROM subscribers WHERE tracking_id = ?')
    return await stmt.get(trackingId) as Subscriber | null
  }

  async getSubscriberByProfileId(profileId: string): Promise<Subscriber | null> {
    const stmt = this.db.prepare('SELECT * FROM subscribers WHERE profile_id = ?')
    return await stmt.get(profileId) as Subscriber | null
  }

  async getSubscriberByContactMethodId(contactMethodId: number): Promise<Subscriber | null> {
    const contact = await contactMethodService.getById(contactMethodId)
    if (!contact) return null
    return this.getSubscriberById(contact.subscriber_id)
  }

  async getSubscriberWithContacts(trackingId: string): Promise<SubscriberWithContacts | null> {
    const subscriber = await this.getSubscriberByTrackingId(trackingId)
    if (!subscriber) return null

    const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)

    return {
      ...subscriber,
      contacts: contacts.map(c => ({
        id: c.id,
        type: c.type,
        value: c.value,
        verified: c.verified
      }))
    }
  }

  async updateSubscriber(id: number, updates: { name?: string; preferred_language?: string; role?: string | null }): Promise<Subscriber | null> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }

    if (updates.preferred_language !== undefined) {
      fields.push('preferred_language = ?')
      values.push(updates.preferred_language)
    }

    if (updates.role !== undefined) {
      fields.push('role = ?')
      values.push(updates.role)
    }

    if (fields.length === 0) {
      return this.getSubscriberById(id)
    }

    fields.push("updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE subscribers
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    await stmt.run(...values)

    return this.getSubscriberById(id)
  }

  async deleteSubscriber(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM subscribers WHERE id = ?')
    const result = await stmt.run(id)
    return result.changes > 0
  }

  /**
   * Find an existing subscriber by email or phone, or create a new one.
   * This is the main entry point for the signup flow.
   */
  async findOrCreateSubscriber(input: {
    email?: string
    phone?: string
    name: string
    language?: string
    role?: string | null
  }): Promise<{ subscriber: Subscriber; isNew: boolean }> {
    // 1. Try to find by email (case-insensitive)
    if (input.email) {
      const emailContact = await contactMethodService.getByValue('email', input.email)
      if (emailContact) {
        const subscriber = await this.getSubscriberById(emailContact.subscriber_id)
        if (subscriber) {
          return { subscriber, isNew: false }
        }
      }
    }

    // 2. Try to find by phone
    if (input.phone) {
      const phoneContact = await contactMethodService.getByValue('phone', input.phone)
      if (phoneContact) {
        const subscriber = await this.getSubscriberById(phoneContact.subscriber_id)
        if (subscriber) {
          return { subscriber, isNew: false }
        }
      }
    }

    // 3. Create new subscriber with contact methods
    const subscriber = await this.createSubscriber(input.name, input.language)

    if (input.email) {
      await contactMethodService.addContactMethod(subscriber.id, 'email', input.email)
    }
    if (input.phone) {
      await contactMethodService.addContactMethod(subscriber.id, 'phone', input.phone)
    }

    return { subscriber, isNew: true }
  }

  /**
   * Get all subscribers (for admin listing)
   */
  async getAllSubscribers(options?: {
    limit?: number
    offset?: number
    search?: string
  }): Promise<Subscriber[]> {
    let query = 'SELECT * FROM subscribers'
    const params: any[] = []

    if (options?.search) {
      query += ' WHERE name ILIKE ?'
      params.push(`%${options.search}%`)
    }

    query += ' ORDER BY created_at DESC'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)

      if (options?.offset) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }
    }

    const stmt = this.db.prepare(query)
    return await stmt.all(...params) as Subscriber[]
  }

  async getSubscriberCount(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM subscribers')
    const result = await stmt.get() as { count: number }
    return result.count
  }

  /**
   * Get all subscribers with their contact methods and subscriptions.
   * For the general subscribers admin page.
   *
   * @param options.accessiblePeopleGroupIds - If provided, only return subscribers with subscriptions
   *   to these people groups, and filter subscriptions to only include accessible people groups.
   *   Used for people group editors who can only see their assigned people groups.
   */
  async getAllSubscribersWithSubscriptions(options?: {
    search?: string
    peopleGroupId?: number
    accessiblePeopleGroupIds?: number[]
  }): Promise<SubscriberWithSubscriptions[]> {
    // Build base query to get subscribers
    let query = 'SELECT DISTINCT s.* FROM subscribers s'
    const params: any[] = []
    let hasWhere = false

    // If accessiblePeopleGroupIds is provided, filter to only subscribers with subscriptions to those people groups
    if (options?.accessiblePeopleGroupIds && options.accessiblePeopleGroupIds.length > 0) {
      const placeholders = options.accessiblePeopleGroupIds.map(() => '?').join(',')
      query += ` JOIN campaign_subscriptions cs ON cs.subscriber_id = s.id WHERE cs.people_group_id IN (${placeholders})`
      params.push(...options.accessiblePeopleGroupIds)
      hasWhere = true
    }

    // If peopleGroupId filter is set, only get subscribers with subscriptions to that people group
    if (options?.peopleGroupId) {
      if (hasWhere) {
        query += ' AND cs.people_group_id = ?'
      } else {
        query += ' JOIN campaign_subscriptions cs ON cs.subscriber_id = s.id WHERE cs.people_group_id = ?'
        hasWhere = true
      }
      params.push(options.peopleGroupId)
    }

    if (options?.search) {
      const searchTerm = `%${options.search}%`
      if (hasWhere) {
        query += ` AND (
          s.name ILIKE ? OR
          EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.value ILIKE ?)
        )`
      } else {
        query += ` WHERE (
          s.name ILIKE ? OR
          EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.value ILIKE ?)
        )`
      }
      params.push(searchTerm, searchTerm)
    }

    query += ' ORDER BY s.created_at DESC'

    const stmt = this.db.prepare(query)
    const subscribers = await stmt.all(...params) as Subscriber[]

    // Enrich each subscriber with contacts and subscriptions
    const enrichedSubscribers: SubscriberWithSubscriptions[] = []

    for (const subscriber of subscribers) {
      const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
      let subscriptions = await peopleGroupSubscriptionService.getSubscriberSubscriptions(subscriber.id)

      // Filter subscriptions to only include accessible people groups
      if (options?.accessiblePeopleGroupIds) {
        subscriptions = subscriptions.filter(sub =>
          options.accessiblePeopleGroupIds!.includes(sub.people_group_id)
        )
      }

      // Find primary email and phone
      const emailContact = contacts.find(c => c.type === 'email' && c.verified) || contacts.find(c => c.type === 'email')
      const phoneContact = contacts.find(c => c.type === 'phone' && c.verified) || contacts.find(c => c.type === 'phone')

      // Get consent info from primary email contact
      const consentedPeopleGroupIds = emailContact?.consented_people_group_ids || []

      // Get people group names for consented IDs
      let peopleGroupNames: string[] = []
      if (consentedPeopleGroupIds.length > 0) {
        const pgStmt = this.db.prepare(`
          SELECT id, name FROM people_groups WHERE id IN (${consentedPeopleGroupIds.map(() => '?').join(',')})
        `)
        const peopleGroups = await pgStmt.all(...consentedPeopleGroupIds) as { id: number; name: string }[]
        peopleGroupNames = consentedPeopleGroupIds.map(id => {
          const pg = peopleGroups.find(p => p.id === id)
          return pg?.name || `People Group ${id}`
        })
      }

      enrichedSubscribers.push({
        ...subscriber,
        contacts: contacts.map(c => ({
          id: c.id,
          type: c.type,
          value: c.value,
          verified: c.verified
        })),
        primary_email: emailContact?.value || null,
        primary_phone: phoneContact?.value || null,
        subscriptions,
        consents: {
          doxa_general: emailContact?.consent_doxa_general || false,
          doxa_general_at: emailContact?.consent_doxa_general_at || null,
          people_group_ids: consentedPeopleGroupIds,
          people_group_names: peopleGroupNames
        }
      })
    }

    return enrichedSubscribers
  }
}

export const subscriberService = new SubscriberService()
