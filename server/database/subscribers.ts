import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildWhere, buildSet } from './sql-helpers'
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
  total_prayer_minutes: number
}

class SubscriberService {
  private sql = getSql()

  async createSubscriber(name: string, language: string = 'en'): Promise<Subscriber> {
    const tracking_id = randomUUID()
    const profile_id = randomUUID()

    const [row] = await this.sql`
      INSERT INTO subscribers (tracking_id, profile_id, name, preferred_language)
      VALUES (${tracking_id}, ${profile_id}, ${name}, ${language})
      RETURNING *
    `
    return row
  }

  async getSubscriberById(id: number): Promise<Subscriber | null> {
    const [row] = await this.sql`SELECT * FROM subscribers WHERE id = ${id}`
    return row || null
  }

  async getSubscriberByTrackingId(trackingId: string): Promise<Subscriber | null> {
    const [row] = await this.sql`SELECT * FROM subscribers WHERE tracking_id = ${trackingId}`
    return row || null
  }

  async getSubscriberByProfileId(profileId: string): Promise<Subscriber | null> {
    const [row] = await this.sql`SELECT * FROM subscribers WHERE profile_id = ${profileId}`
    return row || null
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
    const fields: Fragment[] = []

    if (updates.name !== undefined) fields.push(this.sql`name = ${updates.name}`)
    if (updates.preferred_language !== undefined) fields.push(this.sql`preferred_language = ${updates.preferred_language}`)
    if (updates.role !== undefined) fields.push(this.sql`role = ${updates.role}`)

    if (fields.length === 0) return this.getSubscriberById(id)

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE subscribers SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getSubscriberById(id)
  }

  async deleteSubscriber(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM subscribers WHERE id = ${id}`
    return result.count > 0
  }

  async findOrCreateSubscriber(input: {
    email?: string
    phone?: string
    name: string
    language?: string
    role?: string | null
  }): Promise<{ subscriber: Subscriber; isNew: boolean }> {
    if (input.email) {
      const emailContact = await contactMethodService.getByValue('email', input.email)
      if (emailContact) {
        const subscriber = await this.getSubscriberById(emailContact.subscriber_id)
        if (subscriber) return { subscriber, isNew: false }
      }
    }

    if (input.phone) {
      const phoneContact = await contactMethodService.getByValue('phone', input.phone)
      if (phoneContact) {
        const subscriber = await this.getSubscriberById(phoneContact.subscriber_id)
        if (subscriber) return { subscriber, isNew: false }
      }
    }

    const subscriber = await this.createSubscriber(input.name, input.language)

    if (input.email) {
      await contactMethodService.addContactMethod(subscriber.id, 'email', input.email)
    }
    if (input.phone) {
      await contactMethodService.addContactMethod(subscriber.id, 'phone', input.phone)
    }

    return { subscriber, isNew: true }
  }

  async getAllSubscribers(options?: {
    limit?: number
    offset?: number
    search?: string
  }): Promise<Subscriber[]> {
    const search = options?.search ? `%${options.search}%` : null
    const limit = options?.limit || null
    const offset = options?.offset || null

    if (search && limit) {
      return await this.sql`
        SELECT * FROM subscribers WHERE name ILIKE ${search}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    if (search) {
      return await this.sql`
        SELECT * FROM subscribers WHERE name ILIKE ${search}
        ORDER BY created_at DESC
      `
    }
    if (limit) {
      return await this.sql`
        SELECT * FROM subscribers ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    return await this.sql`SELECT * FROM subscribers ORDER BY created_at DESC`
  }

  async getSubscriberCount(): Promise<number> {
    const [result] = await this.sql`SELECT COUNT(*) as count FROM subscribers`
    return result.count
  }

  async getAllSubscribersWithSubscriptions(options?: {
    search?: string
    peopleGroupId?: number
    accessiblePeopleGroupIds?: number[]
  }): Promise<SubscriberWithSubscriptions[]> {
    const conditions: Fragment[] = []
    let needsJoin = false

    if (options?.accessiblePeopleGroupIds && options.accessiblePeopleGroupIds.length > 0) {
      needsJoin = true
      conditions.push(this.sql`cs.people_group_id IN ${this.sql(options.accessiblePeopleGroupIds)}`)
    }

    if (options?.peopleGroupId) {
      needsJoin = true
      conditions.push(this.sql`cs.people_group_id = ${options.peopleGroupId}`)
    }

    if (options?.search) {
      const searchTerm = `%${options.search}%`
      conditions.push(this.sql`(
        s.name ILIKE ${searchTerm} OR
        EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.value ILIKE ${searchTerm})
      )`)
    }

    const joinClause = needsJoin
      ? this.sql`JOIN campaign_subscriptions cs ON cs.subscriber_id = s.id`
      : this.sql``

    const whereClause = conditions.length > 0
      ? buildWhere(this.sql, conditions)
      : this.sql``

    const subscribers: Subscriber[] = await this.sql`
      SELECT DISTINCT s.* FROM subscribers s
      ${joinClause}
      ${whereClause}
      ORDER BY s.created_at DESC
    `

    // Fetch prayer time totals for all subscribers in one query
    const prayerTimes = await this.sql`
      SELECT tracking_id, COALESCE(ROUND(SUM(duration) / 60.0), 0) as total_minutes
      FROM prayer_activity WHERE tracking_id IS NOT NULL GROUP BY tracking_id
    ` as { tracking_id: string; total_minutes: number }[]
    const prayerTimeMap = new Map(prayerTimes.map(pt => [pt.tracking_id, Number(pt.total_minutes)]))

    const enrichedSubscribers: SubscriberWithSubscriptions[] = []

    for (const subscriber of subscribers) {
      const contacts = await contactMethodService.getSubscriberContactMethods(subscriber.id)
      let subscriptions = await peopleGroupSubscriptionService.getSubscriberSubscriptions(subscriber.id)

      if (options?.accessiblePeopleGroupIds) {
        subscriptions = subscriptions.filter(sub =>
          options.accessiblePeopleGroupIds!.includes(sub.people_group_id)
        )
      }

      const emailContact = contacts.find(c => c.type === 'email' && c.verified) || contacts.find(c => c.type === 'email')
      const phoneContact = contacts.find(c => c.type === 'phone' && c.verified) || contacts.find(c => c.type === 'phone')

      const consentedPeopleGroupIds = emailContact?.consented_people_group_ids || []

      let peopleGroupNames: string[] = []
      if (consentedPeopleGroupIds.length > 0) {
        const peopleGroups = await this.sql`
          SELECT id, name FROM people_groups WHERE id IN ${this.sql(consentedPeopleGroupIds)}
        ` as { id: number; name: string }[]
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
        },
        total_prayer_minutes: prayerTimeMap.get(subscriber.tracking_id) || 0
      })
    }

    return enrichedSubscribers
  }
}

export const subscriberService = new SubscriberService()
