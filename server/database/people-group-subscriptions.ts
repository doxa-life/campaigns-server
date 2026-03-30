import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'
import { calculateNextReminderUtc, calculateNextReminderAfterSend } from '../utils/next-reminder-calculator'
import { contactMethodService } from './contact-methods'
import { appConfigService } from './app-config'

export interface PeopleGroupSubscription {
  id: number
  people_group_id: number
  subscriber_id: number
  delivery_method: 'email' | 'whatsapp' | 'app'
  frequency: string
  days_of_week: number[]
  time_preference: string
  timezone: string
  prayer_duration: number
  next_reminder_utc: string | null
  status: 'active' | 'inactive' | 'unsubscribed' | 'pending'
  created_at: string
  updated_at: string
}

function parseDaysOfWeek(row: any): void {
  row.days_of_week = row.days_of_week
    ? (typeof row.days_of_week === 'string' ? JSON.parse(row.days_of_week) : row.days_of_week)
    : []
}

export interface PeopleGroupSubscriptionWithDetails extends PeopleGroupSubscription {
  people_group_name: string
  people_group_slug: string
  subscriber_name: string
  subscriber_tracking_id: string
  subscriber_profile_id: string
}

export interface SubscriptionDueForReminder extends PeopleGroupSubscription {
  subscriber_name: string
  subscriber_tracking_id: string
  subscriber_profile_id: string
  subscriber_language: string
  email_value: string
  email_verified: boolean
  people_group_slug: string
  people_group_name: string
}

export interface CreateSubscriptionInput {
  people_group_id: number
  subscriber_id: number
  delivery_method: 'email' | 'whatsapp' | 'app'
  frequency: string
  days_of_week?: number[]
  time_preference: string
  timezone?: string
  prayer_duration?: number
}

class PeopleGroupSubscriptionService {
  private sql = getSql()

  async createSubscription(input: CreateSubscriptionInput & { status?: 'active' | 'pending' }): Promise<PeopleGroupSubscription> {
    const days_of_week_json = input.days_of_week ? JSON.stringify(input.days_of_week) : null
    const timezone = input.timezone || 'UTC'
    const status = input.status || 'active'

    const [row] = await this.sql`
      INSERT INTO campaign_subscriptions (
        people_group_id, subscriber_id, delivery_method, frequency, days_of_week,
        time_preference, timezone, prayer_duration, status
      )
      VALUES (
        ${input.people_group_id}, ${input.subscriber_id}, ${input.delivery_method},
        ${input.frequency}, ${days_of_week_json}, ${input.time_preference},
        ${timezone}, ${input.prayer_duration || 10}, ${status}
      )
      RETURNING *
    `

    if (status === 'active') {
      await this.setInitialNextReminder(row?.id)
    }
    return (await this.getById(row?.id))!
  }

  async getById(id: number): Promise<PeopleGroupSubscription | null> {
    const [row] = await this.sql`SELECT * FROM campaign_subscriptions WHERE id = ${id}`
    if (!row) return null
    parseDaysOfWeek(row)
    return row as PeopleGroupSubscription
  }

  async getBySubscriberAndPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<PeopleGroupSubscription | null> {
    const [row] = await this.sql`
      SELECT * FROM campaign_subscriptions
      WHERE subscriber_id = ${subscriberId} AND people_group_id = ${peopleGroupId}
    `
    if (!row) return null
    parseDaysOfWeek(row)
    return row as PeopleGroupSubscription
  }

  async getAllBySubscriberAndPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<PeopleGroupSubscription[]> {
    const rows = await this.sql`
      SELECT * FROM campaign_subscriptions
      WHERE subscriber_id = ${subscriberId} AND people_group_id = ${peopleGroupId}
      ORDER BY created_at ASC
    `
    rows.forEach(parseDaysOfWeek)
    return rows as unknown as PeopleGroupSubscription[]
  }

  async countBySubscriberAndPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<number> {
    const [result] = await this.sql`
      SELECT COUNT(*) as count FROM campaign_subscriptions
      WHERE subscriber_id = ${subscriberId} AND people_group_id = ${peopleGroupId}
    `
    return result?.count
  }

  async unsubscribeAllForPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<number> {
    const result = await this.sql`
      UPDATE campaign_subscriptions
      SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE subscriber_id = ${subscriberId} AND people_group_id = ${peopleGroupId}
    `
    return result.count
  }

  async getSubscriberSubscriptions(subscriberId: number): Promise<PeopleGroupSubscriptionWithDetails[]> {
    const rows = await this.sql`
      SELECT cs.*, pg.name as people_group_name, pg.slug as people_group_slug,
        s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
        s.profile_id as subscriber_profile_id
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      JOIN subscribers s ON s.id = cs.subscriber_id
      WHERE cs.subscriber_id = ${subscriberId}
      ORDER BY cs.created_at DESC
    `
    rows.forEach(parseDaysOfWeek)
    return rows as unknown as PeopleGroupSubscriptionWithDetails[]
  }

  async getPeopleGroupSubscriptions(
    peopleGroupId: number,
    options?: {
      status?: 'active' | 'inactive' | 'unsubscribed' | 'pending'
      limit?: number
      offset?: number
    }
  ): Promise<PeopleGroupSubscriptionWithDetails[]> {
    const status = options?.status || null
    const limit = options?.limit || null
    const offset = options?.offset || null

    let rows
    if (status && limit) {
      rows = await this.sql`
        SELECT cs.*, pg.name as people_group_name, pg.slug as people_group_slug,
          s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
          s.profile_id as subscriber_profile_id
        FROM campaign_subscriptions cs
        JOIN people_groups pg ON pg.id = cs.people_group_id
        JOIN subscribers s ON s.id = cs.subscriber_id
        WHERE cs.people_group_id = ${peopleGroupId} AND cs.status = ${status}
        ORDER BY cs.created_at DESC LIMIT ${limit} OFFSET ${offset || 0}
      `
    } else if (status) {
      rows = await this.sql`
        SELECT cs.*, pg.name as people_group_name, pg.slug as people_group_slug,
          s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
          s.profile_id as subscriber_profile_id
        FROM campaign_subscriptions cs
        JOIN people_groups pg ON pg.id = cs.people_group_id
        JOIN subscribers s ON s.id = cs.subscriber_id
        WHERE cs.people_group_id = ${peopleGroupId} AND cs.status = ${status}
        ORDER BY cs.created_at DESC
      `
    } else if (limit) {
      rows = await this.sql`
        SELECT cs.*, pg.name as people_group_name, pg.slug as people_group_slug,
          s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
          s.profile_id as subscriber_profile_id
        FROM campaign_subscriptions cs
        JOIN people_groups pg ON pg.id = cs.people_group_id
        JOIN subscribers s ON s.id = cs.subscriber_id
        WHERE cs.people_group_id = ${peopleGroupId}
        ORDER BY cs.created_at DESC LIMIT ${limit} OFFSET ${offset || 0}
      `
    } else {
      rows = await this.sql`
        SELECT cs.*, pg.name as people_group_name, pg.slug as people_group_slug,
          s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
          s.profile_id as subscriber_profile_id
        FROM campaign_subscriptions cs
        JOIN people_groups pg ON pg.id = cs.people_group_id
        JOIN subscribers s ON s.id = cs.subscriber_id
        WHERE cs.people_group_id = ${peopleGroupId}
        ORDER BY cs.created_at DESC
      `
    }
    rows.forEach(parseDaysOfWeek)
    return rows as unknown as PeopleGroupSubscriptionWithDetails[]
  }

  async getActiveSubscriptionCount(peopleGroupId: number): Promise<number> {
    const [result] = await this.sql`
      SELECT COUNT(*) as count FROM campaign_subscriptions
      WHERE people_group_id = ${peopleGroupId} AND status = 'active'
    `
    return result?.count
  }

  async updateSubscription(
    id: number,
    updates: {
      delivery_method?: 'email' | 'whatsapp' | 'app'
      frequency?: string
      days_of_week?: number[]
      time_preference?: string
      timezone?: string
      prayer_duration?: number
    }
  ): Promise<PeopleGroupSubscription | null> {
    const fields: Fragment[] = []
    let scheduleChanged = false

    if (updates.delivery_method !== undefined) fields.push(this.sql`delivery_method = ${updates.delivery_method}`)
    if (updates.frequency !== undefined) { fields.push(this.sql`frequency = ${updates.frequency}`); scheduleChanged = true }
    if (updates.days_of_week !== undefined) { fields.push(this.sql`days_of_week = ${JSON.stringify(updates.days_of_week)}`); scheduleChanged = true }
    if (updates.time_preference !== undefined) { fields.push(this.sql`time_preference = ${updates.time_preference}`); scheduleChanged = true }
    if (updates.timezone !== undefined) { fields.push(this.sql`timezone = ${updates.timezone}`); scheduleChanged = true }
    if (updates.prayer_duration !== undefined) fields.push(this.sql`prayer_duration = ${updates.prayer_duration}`)

    if (fields.length === 0) return this.getById(id)

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE campaign_subscriptions SET ${buildSet(this.sql, fields)} WHERE id = ${id}`

    if (scheduleChanged) await this.setInitialNextReminder(id)

    return this.getById(id)
  }

  async updateStatus(id: number, status: 'active' | 'inactive' | 'unsubscribed' | 'pending'): Promise<PeopleGroupSubscription | null> {
    await this.sql`
      UPDATE campaign_subscriptions
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
    return this.getById(id)
  }

  async unsubscribe(id: number): Promise<boolean> {
    const result = await this.sql`
      UPDATE campaign_subscriptions
      SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `
    return result.count > 0
  }

  async resubscribe(id: number, status: 'active' | 'pending' = 'active'): Promise<boolean> {
    const result = await this.sql`
      UPDATE campaign_subscriptions
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${id}
    `

    if (result.count > 0) {
      if (status === 'active') {
        await this.setInitialNextReminder(id)
      }
      await this.resetFollowupTracking(id)
      return true
    }
    return false
  }

  async deleteSubscription(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM campaign_subscriptions WHERE id = ${id}`
    return result.count > 0
  }

  async claimSubscriptionsDueForReminder(batchSize: number = 50): Promise<SubscriptionDueForReminder[]> {
    const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')
    if (globalStartDate) {
      const today = new Date().toISOString().split('T')[0]
      if (today! < globalStartDate) return []
    }

    return await this.sql.begin(async (tx) => {
      const claimed = await (tx as any)`
        SELECT cs.*, s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
          s.profile_id as subscriber_profile_id, s.preferred_language as subscriber_language,
          cm.value as email_value, cm.verified as email_verified,
          pg.slug as people_group_slug, pg.name as people_group_name
        FROM campaign_subscriptions cs
        JOIN subscribers s ON s.id = cs.subscriber_id
        JOIN people_groups pg ON pg.id = cs.people_group_id
        LEFT JOIN contact_methods cm ON cm.subscriber_id = s.id AND cm.type = 'email'
        WHERE cs.next_reminder_utc <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          AND cs.status = 'active'
          AND cs.delivery_method = 'email'
          AND cm.verified = true
          AND (cs.claimed_at IS NULL OR cs.claimed_at < CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '5 minutes')
        ORDER BY cs.next_reminder_utc ASC
        FOR UPDATE OF cs SKIP LOCKED
        LIMIT ${batchSize}
      ` as SubscriptionDueForReminder[]

      if (claimed.length === 0) return []

      const ids = claimed.map(s => s.id)
      await (tx as any)`
        UPDATE campaign_subscriptions
        SET claimed_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id IN ${(tx as any)(ids)}
      `

      claimed.forEach(parseDaysOfWeek)
      return claimed
    })
  }

  async getSubscriptionsDueForReminder(): Promise<SubscriptionDueForReminder[]> {
    const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')
    if (globalStartDate) {
      const today = new Date().toISOString().split('T')[0]
      if (today! < globalStartDate) return []
    }

    const rows = await this.sql`
      SELECT cs.*, s.name as subscriber_name, s.tracking_id as subscriber_tracking_id,
        s.profile_id as subscriber_profile_id, s.preferred_language as subscriber_language,
        cm.value as email_value, cm.verified as email_verified,
        pg.slug as people_group_slug, pg.name as people_group_name
      FROM campaign_subscriptions cs
      JOIN subscribers s ON s.id = cs.subscriber_id
      JOIN people_groups pg ON pg.id = cs.people_group_id
      LEFT JOIN contact_methods cm ON cm.subscriber_id = s.id AND cm.type = 'email'
      WHERE cs.next_reminder_utc <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        AND cs.status = 'active'
        AND cs.delivery_method = 'email'
        AND cm.verified = true
      ORDER BY cs.next_reminder_utc ASC
    `
    rows.forEach(parseDaysOfWeek)
    return rows as unknown as SubscriptionDueForReminder[]
  }

  async updateNextReminderUtc(subscriptionId: number, nextUtc: Date): Promise<void> {
    await this.sql`
      UPDATE campaign_subscriptions
      SET next_reminder_utc = ${nextUtc.toISOString()}, claimed_at = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${subscriptionId}
    `
  }

  async setInitialNextReminder(subscriptionId: number): Promise<void> {
    const subscription = await this.getById(subscriptionId)
    if (!subscription) return

    const nextUtc = await calculateNextReminderUtc({
      timezone: subscription.timezone || 'UTC',
      timePreference: subscription.time_preference,
      frequency: subscription.frequency,
      daysOfWeek: subscription.days_of_week.length > 0 ? subscription.days_of_week : undefined
    })

    await this.updateNextReminderUtc(subscriptionId, nextUtc)
  }

  async setNextReminderAfterSend(subscriptionId: number): Promise<void> {
    const subscription = await this.getById(subscriptionId)
    if (!subscription) return

    const nextUtc = calculateNextReminderAfterSend({
      timezone: subscription.timezone || 'UTC',
      timePreference: subscription.time_preference,
      frequency: subscription.frequency,
      daysOfWeek: subscription.days_of_week.length > 0 ? subscription.days_of_week : undefined
    })

    await this.updateNextReminderUtc(subscriptionId, nextUtc)
  }

  async activatePendingSubscriptions(subscriberId: number): Promise<number> {
    const result = await this.sql`
      UPDATE campaign_subscriptions
      SET status = 'active', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE subscriber_id = ${subscriberId} AND status = 'pending'
    `
    return result.count
  }

  async setNextRemindersForSubscriber(subscriberId: number): Promise<void> {
    const subscriptions = await this.sql`
      SELECT id FROM campaign_subscriptions
      WHERE subscriber_id = ${subscriberId} AND status = 'active' AND delivery_method = 'email'
    ` as { id: number }[]

    for (const sub of subscriptions) {
      await this.setInitialNextReminder(sub.id)
    }
  }

  async getCommitmentStats(peopleGroupId: number): Promise<{ people_committed: number; committed_duration: number }> {
    const [result] = await this.sql`
      SELECT COUNT(*) as people_committed, COALESCE(SUM(prayer_duration), 0) as committed_duration
      FROM campaign_subscriptions
      WHERE people_group_id = ${peopleGroupId} AND status = 'active'
    `
    return { people_committed: result?.people_committed, committed_duration: result?.committed_duration }
  }

  async getCommitmentStatsForPeopleGroups(peopleGroupIds: number[]): Promise<Map<number, { people_committed: number; committed_duration: number }>> {
    if (peopleGroupIds.length === 0) return new Map()

    const results = await this.sql`
      SELECT people_group_id, COUNT(*) as people_committed, COALESCE(SUM(prayer_duration), 0) as committed_duration
      FROM campaign_subscriptions
      WHERE people_group_id IN ${this.sql(peopleGroupIds)} AND status = 'active'
      GROUP BY people_group_id
    ` as Array<{ people_group_id: number; people_committed: number; committed_duration: number }>

    const statsMap = new Map<number, { people_committed: number; committed_duration: number }>()
    for (const id of peopleGroupIds) {
      statsMap.set(id, { people_committed: 0, committed_duration: 0 })
    }
    for (const row of results) {
      statsMap.set(row.people_group_id, { people_committed: row.people_committed, committed_duration: row.committed_duration })
    }
    return statsMap
  }

  async getGlobalCommitmentStats(): Promise<{ people_committed: number; committed_duration: number }> {
    const [result] = await this.sql`
      SELECT COUNT(*) as people_committed, COALESCE(SUM(prayer_duration), 0) as committed_duration
      FROM campaign_subscriptions WHERE status = 'active'
    `
    return { people_committed: result?.people_committed, committed_duration: result?.committed_duration }
  }

  async markFollowupSent(subscriptionId: number): Promise<void> {
    await this.sql`
      UPDATE campaign_subscriptions
      SET last_followup_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          followup_reminder_count = followup_reminder_count + 1,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${subscriptionId}
    `
  }

  async completeFollowupCycle(subscriptionId: number): Promise<void> {
    await this.sql`
      UPDATE campaign_subscriptions
      SET followup_count = followup_count + 1, followup_reminder_count = 0,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${subscriptionId}
    `
  }

  async resetFollowupReminders(subscriptionId: number): Promise<void> {
    await this.sql`
      UPDATE campaign_subscriptions
      SET followup_reminder_count = 0, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${subscriptionId}
    `
  }

  async resetFollowupTracking(subscriptionId: number): Promise<void> {
    await this.sql`
      UPDATE campaign_subscriptions
      SET followup_count = 0, followup_reminder_count = 0, last_followup_at = NULL,
          updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ${subscriptionId}
    `
  }

  async getSubscriptionWithFollowupDetails(subscriptionId: number): Promise<PeopleGroupSubscription & {
    last_followup_at: string | null
    followup_count: number
    followup_reminder_count: number
  } | null> {
    const [row] = await this.sql`SELECT * FROM campaign_subscriptions WHERE id = ${subscriptionId}`
    if (!row) return null
    parseDaysOfWeek(row)
    return row as PeopleGroupSubscription & {
      last_followup_at: string | null
      followup_count: number
      followup_reminder_count: number
    }
  }
}

export const peopleGroupSubscriptionService = new PeopleGroupSubscriptionService()
