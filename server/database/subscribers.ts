import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildWhere, buildSet } from './sql-helpers'
import { randomUUID } from 'crypto'
import { contactMethodService, type ContactMethod } from './contact-methods'
import { peopleGroupSubscriptionService, type PeopleGroupSubscriptionWithDetails } from './people-group-subscriptions'
import type { FilterState } from '#shared/crm/filter-types'
import { buildFilterConditions } from '../utils/crm/filter-sql'
import { subscriberServerManifest } from '../utils/crm/manifests/subscriber'
import { decodeCursor, encodeCursor, type PageCursor } from '../utils/crm/cursor'
import { roleService } from './roles'
import { peopleGroupAccessService } from './people-group-access'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

export interface Subscriber {
  id: number
  tracking_id: string
  profile_id: string
  name: string
  preferred_language: string
  role: string | null
  country: string | null
  sources: string[]
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
  prayer_session_count: number
  comment_count: number
}

class SubscriberService {
  private sql = getSql()

  async createSubscriber(name: string, language: string = 'en', country: string | null = null, trackingId?: string | null): Promise<Subscriber> {
    const profile_id = randomUUID()
    let tracking_id = isUuid(trackingId) ? trackingId : randomUUID()

    for (let attempt = 0; attempt < 2; attempt++) {
      const [row] = await this.sql<Subscriber[]>`
        INSERT INTO subscribers (tracking_id, profile_id, name, preferred_language, country)
        VALUES (${tracking_id}, ${profile_id}, ${name}, ${language}, ${country})
        ON CONFLICT (tracking_id) DO NOTHING
        RETURNING *
      `
      if (row) return row
      // tracking_id already bound to another subscriber (shared device or concurrent signup) — use a fresh one
      tracking_id = randomUUID()
    }

    throw new Error('Failed to create subscriber: tracking_id collision could not be resolved')
  }

  async getSubscriberById(id: number): Promise<Subscriber | null> {
    const [row] = await this.sql<Subscriber[]>`SELECT * FROM subscribers WHERE id = ${id}`
    return row ?? null
  }

  async getSubscriberByTrackingId(trackingId: string): Promise<Subscriber | null> {
    const [row] = await this.sql<Subscriber[]>`SELECT * FROM subscribers WHERE tracking_id = ${trackingId}`
    return row ?? null
  }

  async getSubscriberByProfileId(profileId: string): Promise<Subscriber | null> {
    const [row] = await this.sql<Subscriber[]>`SELECT * FROM subscribers WHERE profile_id = ${profileId}`
    return row ?? null
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

  async updateSubscriber(id: number, updates: { name?: string; preferred_language?: string; role?: string | null; country?: string | null; sources?: string[] }): Promise<Subscriber | null> {
    const fields: Fragment[] = []

    if (updates.name !== undefined) fields.push(this.sql`name = ${updates.name}`)
    if (updates.preferred_language !== undefined) fields.push(this.sql`preferred_language = ${updates.preferred_language}`)
    if (updates.role !== undefined) fields.push(this.sql`role = ${updates.role}`)
    if (updates.country !== undefined) fields.push(this.sql`country = ${updates.country}`)
    if (updates.sources !== undefined) fields.push(this.sql`sources = ${updates.sources}`)

    if (fields.length === 0) return this.getSubscriberById(id)

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE subscribers SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getSubscriberById(id)
  }

  async addSource(id: number, source: string): Promise<void> {
    await this.sql`
      UPDATE subscribers
      SET sources = array_append(sources, ${source}),
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id} AND NOT (${source} = ANY(sources))
    `
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
    country?: string | null
    trackingId?: string | null
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

    const subscriber = await this.createSubscriber(input.name, input.language, input.country || null, input.trackingId)

    if (input.email) {
      await contactMethodService.addContactMethod(subscriber.id, 'email', input.email)
    }
    if (input.phone) {
      await contactMethodService.addContactMethod(subscriber.id, 'phone', input.phone)
    }

    return { subscriber, isNew: true }
  }

  /**
   * Find a subscriber by the app-provided tracking_id, or create an anonymous
   * one bound to it. Unlike createSubscriber, this never re-mints the id on
   * conflict — it re-fetches, so the app's stored tracking_id stays valid.
   */
  async findOrCreateByTrackingId(
    trackingId: string | null | undefined,
    language: string = 'en'
  ): Promise<{ subscriber: Subscriber; isNew: boolean }> {
    if (isUuid(trackingId)) {
      const existing = await this.getSubscriberByTrackingId(trackingId)
      if (existing) return { subscriber: existing, isNew: false }

      const profile_id = randomUUID()
      const [row] = await this.sql<Subscriber[]>`
        INSERT INTO subscribers (tracking_id, profile_id, name, preferred_language)
        VALUES (${trackingId}, ${profile_id}, ${'Anonymous'}, ${language})
        ON CONFLICT (tracking_id) DO NOTHING
        RETURNING *
      `
      if (row) return { subscriber: row, isNew: true }

      // Lost a race to a concurrent insert with the same tracking_id — reuse it.
      const raced = await this.getSubscriberByTrackingId(trackingId)
      if (raced) return { subscriber: raced, isNew: false }
    }

    const subscriber = await this.createSubscriber('Anonymous', language)
    return { subscriber, isNew: true }
  }

  /**
   * Resolve the subscriber for a news signup. Email is the canonical identity:
   * 1) if the email already exists, use its subscriber;
   * 2) else attach the email to the anonymous subscriber named by trackingId;
   * 3) else create a fresh subscriber.
   */
  async findOrCreateForNews(input: {
    email: string
    name: string
    country?: string | null
    language?: string
    trackingId?: string | null
  }): Promise<{ subscriber: Subscriber; isNew: boolean }> {
    const emailContact = await contactMethodService.getByValue('email', input.email)
    if (emailContact) {
      const subscriber = await this.getSubscriberById(emailContact.subscriber_id)
      if (subscriber) return { subscriber, isNew: false }
    }

    if (isUuid(input.trackingId)) {
      const existing = await this.getSubscriberByTrackingId(input.trackingId)
      if (existing) {
        await contactMethodService.addContactMethod(existing.id, 'email', input.email)
        return { subscriber: existing, isNew: false }
      }
    }

    const subscriber = await this.createSubscriber(input.name, input.language, input.country || null, input.trackingId)
    await contactMethodService.addContactMethod(subscriber.id, 'email', input.email)
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
    const [result] = await this.sql<{ count: number }[]>`SELECT COUNT(*) as count FROM subscribers`
    return result!.count
  }

  async getSubscribersPage(options: {
    filter?: FilterState | null
    search?: string
    cursor?: string | null
    limit?: number
    accessiblePeopleGroupIds?: number[]
  }): Promise<{ items: SubscriberWithSubscriptions[]; nextCursor: string | null; totalCount?: number }> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
    const cursor = decodeCursor(options.cursor)

    // Base conditions (permission + filter + search) describe the full matching
    // set. The cursor is applied only to the page query, not the count.
    const baseConditions: Fragment[] = []

    // Permission scoping: restrict to subscribers with at least one subscription
    // in an accessible people group. Uses EXISTS so no DISTINCT is needed.
    if (options.accessiblePeopleGroupIds) {
      if (options.accessiblePeopleGroupIds.length === 0) {
        return { items: [], nextCursor: null, totalCount: 0 }
      }
      baseConditions.push(this.sql`EXISTS (
        SELECT 1 FROM campaign_subscriptions cs
        WHERE cs.subscriber_id = s.id
        AND cs.people_group_id IN ${this.sql(options.accessiblePeopleGroupIds)}
      )`)
    }

    // User-defined filter rows from the filter builder.
    const filterConditions = buildFilterConditions(subscriberServerManifest, options.filter ?? null, this.sql)
    baseConditions.push(...filterConditions)

    // Global search: name, tracking_id, contact value, exact id match.
    if (options.search) {
      const term = options.search.trim()
      if (term) {
        const like = `%${term}%`
        const exactId = /^\d+$/.test(term) ? Number(term) : null
        if (exactId !== null) {
          baseConditions.push(this.sql`(
            s.name ILIKE ${like}
            OR s.tracking_id ILIKE ${like}
            OR s.id = ${exactId}
            OR EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.value ILIKE ${like})
          )`)
        } else {
          baseConditions.push(this.sql`(
            s.name ILIKE ${like}
            OR s.tracking_id ILIKE ${like}
            OR EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.subscriber_id = s.id AND cm.value ILIKE ${like})
          )`)
        }
      }
    }

    const pageConditions = [...baseConditions]

    // Cursor: (created_at, id) DESC, lexicographic.
    // `::text::timestamp` (not `::timestamp`) forces postgres.js to send the
    // parameter as text instead of inferring type 1114 — that path round-trips
    // through JS Date and loses microsecond precision, silently excluding rows.
    if (cursor) {
      pageConditions.push(this.sql`(
        s.created_at < ${cursor.c}::text::timestamp
        OR (s.created_at = ${cursor.c}::text::timestamp AND s.id < ${cursor.i})
      )`)
    }

    const whereClause = pageConditions.length > 0
      ? buildWhere(this.sql, pageConditions)
      : this.sql``

    // Fetch one extra row to detect whether there's a next page.
    // created_at_cursor is a text-cast of created_at so the cursor preserves
    // microsecond precision (JS Date would truncate to milliseconds).
    const fetchLimit = limit + 1
    const rows = await this.sql<(Subscriber & { created_at_cursor: string })[]>`
      SELECT s.*, s.created_at::text AS created_at_cursor FROM subscribers s
      ${whereClause}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ${fetchLimit}
    `

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows

    const items = await this.enrichSubscribers(pageRows, options.accessiblePeopleGroupIds)

    let nextCursor: string | null = null
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]!
      nextCursor = encodeCursor({ c: last.created_at_cursor, i: last.id })
    }

    // Total over the full matching set. Only computed for the first page; on
    // load-more the client already has it.
    let totalCount: number | undefined
    if (!cursor) {
      const countWhere = baseConditions.length > 0 ? buildWhere(this.sql, baseConditions) : this.sql``
      const [countRow] = await this.sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM subscribers s ${countWhere}
      `
      totalCount = countRow!.count
    }

    return { items, nextCursor, totalCount }
  }

  async getSubscriberWithSubscriptions(id: number, accessiblePeopleGroupIds?: number[]): Promise<SubscriberWithSubscriptions | null> {
    const row = await this.getSubscriberById(id)
    if (!row) return null
    const [enriched] = await this.enrichSubscribers([row], accessiblePeopleGroupIds)
    return enriched ?? null
  }

  /**
   * Whether a user may access (view/edit/delete) a given subscriber.
   * Full (unscoped) roles always can. Scoped roles only when the subscriber
   * has at least one subscription in a people group the user is assigned to.
   */
  async userCanAccessSubscriber(userId: string, subscriberId: number): Promise<boolean> {
    const scoped = await roleService.isPermissionScoped(userId, 'subscribers.view')
    if (!scoped) return true
    const accessiblePeopleGroupIds = await peopleGroupAccessService.getUserPeopleGroups(userId)
    if (accessiblePeopleGroupIds.length === 0) return false
    const enriched = await this.getSubscriberWithSubscriptions(subscriberId, accessiblePeopleGroupIds)
    return !!enriched && enriched.subscriptions.length > 0
  }

  /**
   * Batched enrichment: one round-trip each for contacts, subscriptions,
   * consent people-group names, prayer totals, and comment counts — regardless
   * of how many subscribers are passed in. Replaces the per-row N+1 path.
   */
  private async enrichSubscribers(
    rows: Subscriber[],
    accessiblePeopleGroupIds?: number[]
  ): Promise<SubscriberWithSubscriptions[]> {
    if (rows.length === 0) return []

    const ids = rows.map(r => r.id)
    const trackingIds = rows.map(r => r.tracking_id).filter((t): t is string => !!t)

    const contactsRows = await this.sql<ContactMethod[]>`
      SELECT * FROM contact_methods
      WHERE subscriber_id IN ${this.sql(ids)}
      ORDER BY subscriber_id, type, created_at
    `
    const contactsBySubscriber = new Map<number, ContactMethod[]>()
    for (const c of contactsRows) {
      const list = contactsBySubscriber.get(c.subscriber_id) ?? []
      list.push(c)
      contactsBySubscriber.set(c.subscriber_id, list)
    }

    const subscriptionRows = await this.sql`
      SELECT cs.*, pg.name as people_group_name, pg.slug as people_group_slug,
        s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
        s.profile_id as subscriber_profile_id
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      JOIN subscribers s ON s.id = cs.subscriber_id
      WHERE cs.subscriber_id IN ${this.sql(ids)}
      ORDER BY cs.subscriber_id, cs.created_at DESC
    ` as any[]
    const subscriptionsBySubscriber = new Map<number, PeopleGroupSubscriptionWithDetails[]>()
    for (const row of subscriptionRows) {
      row.days_of_week = row.days_of_week
        ? (typeof row.days_of_week === 'string' ? JSON.parse(row.days_of_week) : row.days_of_week)
        : []
      const list = subscriptionsBySubscriber.get(row.subscriber_id) ?? []
      list.push(row as PeopleGroupSubscriptionWithDetails)
      subscriptionsBySubscriber.set(row.subscriber_id, list)
    }

    // Collect all people-group IDs referenced by consents, look them up once.
    const consentedPgIds = new Set<number>()
    for (const c of contactsRows) {
      for (const pgId of c.consented_people_group_ids || []) consentedPgIds.add(pgId)
    }
    const pgNameById = new Map<number, string>()
    if (consentedPgIds.size > 0) {
      const pgRows = await this.sql`
        SELECT id, name FROM people_groups WHERE id IN ${this.sql([...consentedPgIds])}
      ` as { id: number; name: string }[]
      for (const pg of pgRows) pgNameById.set(pg.id, pg.name)
    }

    const prayerTimeMap = new Map<string, { minutes: number; sessions: number }>()
    if (trackingIds.length > 0) {
      const prayerRows = await this.sql`
        SELECT tracking_id, COALESCE(ROUND(SUM(duration) / 60.0), 0) as total_minutes, COUNT(*) as session_count
        FROM prayer_activity
        WHERE tracking_id IN ${this.sql(trackingIds)}
        GROUP BY tracking_id
      ` as { tracking_id: string; total_minutes: number; session_count: number }[]
      for (const pt of prayerRows) {
        prayerTimeMap.set(pt.tracking_id, { minutes: Number(pt.total_minutes), sessions: Number(pt.session_count) })
      }
    }

    const commentRows = await this.sql`
      SELECT record_id, COUNT(*) as count
      FROM comments
      WHERE record_type = 'subscriber' AND record_id IN ${this.sql(ids)}
      GROUP BY record_id
    ` as { record_id: number; count: number }[]
    const commentCountMap = new Map(commentRows.map(c => [c.record_id, Number(c.count)]))

    return rows.map(subscriber => {
      const contacts = contactsBySubscriber.get(subscriber.id) ?? []
      let subscriptions = subscriptionsBySubscriber.get(subscriber.id) ?? []

      if (accessiblePeopleGroupIds) {
        subscriptions = subscriptions.filter(sub =>
          accessiblePeopleGroupIds.includes(sub.people_group_id)
        )
      }

      const emailContact = contacts.find(c => c.type === 'email' && c.verified) || contacts.find(c => c.type === 'email')
      const phoneContact = contacts.find(c => c.type === 'phone' && c.verified) || contacts.find(c => c.type === 'phone')

      const consentedPeopleGroupIds = emailContact?.consented_people_group_ids || []
      const peopleGroupNames = consentedPeopleGroupIds.map(id =>
        pgNameById.get(id) || `People Group ${id}`
      )

      return {
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
        total_prayer_minutes: prayerTimeMap.get(subscriber.tracking_id)?.minutes || 0,
        prayer_session_count: prayerTimeMap.get(subscriber.tracking_id)?.sessions || 0,
        comment_count: commentCountMap.get(subscriber.id) || 0
      }
    })
  }
}

export const subscriberService = new SubscriberService()
