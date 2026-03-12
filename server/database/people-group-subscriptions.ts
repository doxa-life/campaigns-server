import { getDatabase } from './db'
import { calculateNextReminderUtc, calculateNextReminderAfterSend } from '../utils/next-reminder-calculator'
import { contactMethodService } from './contact-methods'
import { appConfigService } from './app-config'

export interface PeopleGroupSubscription {
  id: number
  people_group_id: number
  subscriber_id: number
  delivery_method: 'email' | 'whatsapp' | 'app'
  frequency: string
  days_of_week: string | null
  time_preference: string
  timezone: string
  prayer_duration: number
  next_reminder_utc: string | null
  status: 'active' | 'inactive' | 'unsubscribed'
  created_at: string
  updated_at: string
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
  private db = getDatabase()

  async createSubscription(input: CreateSubscriptionInput): Promise<PeopleGroupSubscription> {
    const days_of_week_json = input.days_of_week ? JSON.stringify(input.days_of_week) : null
    const timezone = input.timezone || 'UTC'

    const stmt = this.db.prepare(`
      INSERT INTO campaign_subscriptions (
        people_group_id, subscriber_id, delivery_method, frequency, days_of_week,
        time_preference, timezone, prayer_duration, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `)

    const result = await stmt.run(
      input.people_group_id,
      input.subscriber_id,
      input.delivery_method,
      input.frequency,
      days_of_week_json,
      input.time_preference,
      timezone,
      input.prayer_duration || 10
    )

    const subscription = (await this.getById(result.lastInsertRowid as number))!

    // Set initial next reminder time
    await this.setInitialNextReminder(subscription.id)

    return (await this.getById(subscription.id))!
  }

  async getById(id: number): Promise<PeopleGroupSubscription | null> {
    const stmt = this.db.prepare('SELECT * FROM campaign_subscriptions WHERE id = ?')
    return await stmt.get(id) as PeopleGroupSubscription | null
  }

  async getBySubscriberAndPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<PeopleGroupSubscription | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM campaign_subscriptions
      WHERE subscriber_id = ? AND people_group_id = ?
    `)
    return await stmt.get(subscriberId, peopleGroupId) as PeopleGroupSubscription | null
  }

  /**
   * Get all subscriptions for a subscriber on a specific people group
   */
  async getAllBySubscriberAndPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<PeopleGroupSubscription[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM campaign_subscriptions
      WHERE subscriber_id = ? AND people_group_id = ?
      ORDER BY created_at ASC
    `)
    return await stmt.all(subscriberId, peopleGroupId) as PeopleGroupSubscription[]
  }

  /**
   * Count subscriptions for a subscriber on a specific people group
   */
  async countBySubscriberAndPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM campaign_subscriptions
      WHERE subscriber_id = ? AND people_group_id = ?
    `)
    const result = await stmt.get(subscriberId, peopleGroupId) as { count: number }
    return result.count
  }

  /**
   * Unsubscribe from all subscriptions for a subscriber on a people group
   */
  async unsubscribeAllForPeopleGroup(
    subscriberId: number,
    peopleGroupId: number
  ): Promise<number> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE subscriber_id = ? AND people_group_id = ?
    `)
    const result = await stmt.run(subscriberId, peopleGroupId)
    return result.changes
  }

  /**
   * Get all subscriptions for a subscriber (with people group details)
   */
  async getSubscriberSubscriptions(subscriberId: number): Promise<PeopleGroupSubscriptionWithDetails[]> {
    const stmt = this.db.prepare(`
      SELECT
        cs.*,
        pg.name as people_group_name,
        pg.slug as people_group_slug,
        s.name as subscriber_name,
        s.tracking_id as subscriber_tracking_id,
        s.profile_id as subscriber_profile_id
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      JOIN subscribers s ON s.id = cs.subscriber_id
      WHERE cs.subscriber_id = ?
      ORDER BY cs.created_at DESC
    `)
    return await stmt.all(subscriberId) as PeopleGroupSubscriptionWithDetails[]
  }

  /**
   * Get all subscriptions for a people group (with subscriber details)
   */
  async getPeopleGroupSubscriptions(
    peopleGroupId: number,
    options?: {
      status?: 'active' | 'inactive' | 'unsubscribed'
      limit?: number
      offset?: number
    }
  ): Promise<PeopleGroupSubscriptionWithDetails[]> {
    let query = `
      SELECT
        cs.*,
        pg.name as people_group_name,
        pg.slug as people_group_slug,
        s.name as subscriber_name,
        s.tracking_id as subscriber_tracking_id,
        s.profile_id as subscriber_profile_id
      FROM campaign_subscriptions cs
      JOIN people_groups pg ON pg.id = cs.people_group_id
      JOIN subscribers s ON s.id = cs.subscriber_id
      WHERE cs.people_group_id = ?
    `
    const params: any[] = [peopleGroupId]

    if (options?.status) {
      query += ' AND cs.status = ?'
      params.push(options.status)
    }

    query += ' ORDER BY cs.created_at DESC'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)

      if (options?.offset) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }
    }

    const stmt = this.db.prepare(query)
    return await stmt.all(...params) as PeopleGroupSubscriptionWithDetails[]
  }

  /**
   * Get active subscription count for a people group
   */
  async getActiveSubscriptionCount(peopleGroupId: number): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM campaign_subscriptions
      WHERE people_group_id = ? AND status = 'active'
    `)
    const result = await stmt.get(peopleGroupId) as { count: number }
    return result.count
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
    const fields: string[] = []
    const values: any[] = []
    let scheduleChanged = false

    if (updates.delivery_method !== undefined) {
      fields.push('delivery_method = ?')
      values.push(updates.delivery_method)
    }
    if (updates.frequency !== undefined) {
      fields.push('frequency = ?')
      values.push(updates.frequency)
      scheduleChanged = true
    }
    if (updates.days_of_week !== undefined) {
      fields.push('days_of_week = ?')
      values.push(JSON.stringify(updates.days_of_week))
      scheduleChanged = true
    }
    if (updates.time_preference !== undefined) {
      fields.push('time_preference = ?')
      values.push(updates.time_preference)
      scheduleChanged = true
    }
    if (updates.timezone !== undefined) {
      fields.push('timezone = ?')
      values.push(updates.timezone)
      scheduleChanged = true
    }
    if (updates.prayer_duration !== undefined) {
      fields.push('prayer_duration = ?')
      values.push(updates.prayer_duration)
    }

    if (fields.length === 0) {
      return this.getById(id)
    }

    fields.push("updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET ${fields.join(', ')}
      WHERE id = ?
    `)
    await stmt.run(...values)

    // Recalculate next reminder if schedule changed
    if (scheduleChanged) {
      await this.setInitialNextReminder(id)
    }

    return this.getById(id)
  }

  async updateStatus(
    id: number,
    status: 'active' | 'inactive' | 'unsubscribed'
  ): Promise<PeopleGroupSubscription | null> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET status = ?, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(status, id)
    return this.getById(id)
  }

  async unsubscribe(id: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET status = 'unsubscribed', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    const result = await stmt.run(id)
    return result.changes > 0
  }

  async resubscribe(id: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET status = 'active', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    const result = await stmt.run(id)

    if (result.changes > 0) {
      await this.setInitialNextReminder(id)
      // Reset follow-up tracking on reactivation
      await this.resetFollowupTracking(id)
      return true
    }
    return false
  }

  async deleteSubscription(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM campaign_subscriptions WHERE id = ?')
    const result = await stmt.run(id)
    return result.changes > 0
  }

  /**
   * Claim a batch of subscriptions due for a reminder using row-level locking.
   * Uses FOR UPDATE SKIP LOCKED so multiple instances can process different batches concurrently.
   * Advances next_reminder_utc inside the transaction before returning.
   */
  async claimSubscriptionsDueForReminder(batchSize: number = 50): Promise<SubscriptionDueForReminder[]> {
    const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')
    if (globalStartDate) {
      const today = new Date().toISOString().split('T')[0]
      if (today! < globalStartDate) {
        return []
      }
    }

    return await this.db.transaction(async (tx) => {
      const selectStmt = tx.prepare(`
        SELECT
          cs.*,
          s.name as subscriber_name,
          s.tracking_id as subscriber_tracking_id,
          s.profile_id as subscriber_profile_id,
          s.preferred_language as subscriber_language,
          cm.value as email_value,
          cm.verified as email_verified,
          pg.slug as people_group_slug,
          pg.name as people_group_name
        FROM campaign_subscriptions cs
        JOIN subscribers s ON s.id = cs.subscriber_id
        JOIN people_groups pg ON pg.id = cs.people_group_id
        LEFT JOIN contact_methods cm ON cm.subscriber_id = s.id AND cm.type = 'email'
        WHERE cs.next_reminder_utc <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          AND cs.status = 'active'
          AND cs.delivery_method = 'email'
          AND cm.verified = true
        ORDER BY cs.next_reminder_utc ASC
        FOR UPDATE OF cs SKIP LOCKED
        LIMIT ?
      `)
      const claimed = await selectStmt.all(batchSize) as SubscriptionDueForReminder[]

      if (claimed.length === 0) {
        return []
      }

      for (const sub of claimed) {
        const daysOfWeek = sub.days_of_week ? JSON.parse(sub.days_of_week) : undefined
        const nextUtc = calculateNextReminderAfterSend({
          timezone: sub.timezone || 'UTC',
          timePreference: sub.time_preference,
          frequency: sub.frequency,
          daysOfWeek
        })
        const updateStmt = tx.prepare(`
          UPDATE campaign_subscriptions
          SET next_reminder_utc = ?, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          WHERE id = ?
        `)
        await updateStmt.run(nextUtc.toISOString(), sub.id)
      }

      return claimed
    })
  }

  /**
   * Get subscriptions that are due for a reminder.
   * Only returns subscriptions where:
   * - next_reminder_utc <= now
   * - status = 'active'
   * - delivery_method = 'email' (for now)
   * - The subscriber has a verified email
   * - The global start date has been reached (if configured)
   */
  async getSubscriptionsDueForReminder(): Promise<SubscriptionDueForReminder[]> {
    const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')
    if (globalStartDate) {
      const today = new Date().toISOString().split('T')[0]
      if (today! < globalStartDate) {
        return []
      }
    }

    const stmt = this.db.prepare(`
      SELECT
        cs.*,
        s.name as subscriber_name,
        s.tracking_id as subscriber_tracking_id,
        s.profile_id as subscriber_profile_id,
        s.preferred_language as subscriber_language,
        cm.value as email_value,
        cm.verified as email_verified,
        pg.slug as people_group_slug,
        pg.name as people_group_name
      FROM campaign_subscriptions cs
      JOIN subscribers s ON s.id = cs.subscriber_id
      JOIN people_groups pg ON pg.id = cs.people_group_id
      LEFT JOIN contact_methods cm ON cm.subscriber_id = s.id AND cm.type = 'email'
      WHERE cs.next_reminder_utc <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        AND cs.status = 'active'
        AND cs.delivery_method = 'email'
        AND cm.verified = true
      ORDER BY cs.next_reminder_utc ASC
    `)
    return await stmt.all() as SubscriptionDueForReminder[]
  }

  async updateNextReminderUtc(subscriptionId: number, nextUtc: Date): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET next_reminder_utc = ?, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(nextUtc.toISOString(), subscriptionId)
  }

  async setInitialNextReminder(subscriptionId: number): Promise<void> {
    const subscription = await this.getById(subscriptionId)
    if (!subscription) return

    const daysOfWeek = subscription.days_of_week ? JSON.parse(subscription.days_of_week) : undefined

    const nextUtc = await calculateNextReminderUtc({
      timezone: subscription.timezone || 'UTC',
      timePreference: subscription.time_preference,
      frequency: subscription.frequency,
      daysOfWeek
    })

    await this.updateNextReminderUtc(subscriptionId, nextUtc)
  }

  async setNextReminderAfterSend(subscriptionId: number): Promise<void> {
    const subscription = await this.getById(subscriptionId)
    if (!subscription) return

    const daysOfWeek = subscription.days_of_week ? JSON.parse(subscription.days_of_week) : undefined

    const nextUtc = calculateNextReminderAfterSend({
      timezone: subscription.timezone || 'UTC',
      timePreference: subscription.time_preference,
      frequency: subscription.frequency,
      daysOfWeek
    })

    await this.updateNextReminderUtc(subscriptionId, nextUtc)
  }

  /**
   * Set initial next reminder for all active email subscriptions of a subscriber.
   * Called after a contact method is verified.
   */
  async setNextRemindersForSubscriber(subscriberId: number): Promise<void> {
    const stmt = this.db.prepare(`
      SELECT id FROM campaign_subscriptions
      WHERE subscriber_id = ? AND status = 'active' AND delivery_method = 'email'
    `)
    const subscriptions = await stmt.all(subscriberId) as { id: number }[]

    for (const sub of subscriptions) {
      await this.setInitialNextReminder(sub.id)
    }
  }

  /**
   * Get commitment stats for a single people group.
   * Returns count of active subscriptions and total committed prayer minutes.
   */
  async getCommitmentStats(peopleGroupId: number): Promise<{ people_committed: number; committed_duration: number }> {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as people_committed,
        COALESCE(SUM(prayer_duration), 0) as committed_duration
      FROM campaign_subscriptions
      WHERE people_group_id = ? AND status = 'active'
    `)
    const result = await stmt.get(peopleGroupId) as { people_committed: number; committed_duration: number }
    return {
      people_committed: result.people_committed,
      committed_duration: result.committed_duration
    }
  }

  /**
   * Get commitment stats for multiple people groups in a single query.
   * Returns a Map of people_group_id to stats.
   */
  async getCommitmentStatsForPeopleGroups(peopleGroupIds: number[]): Promise<Map<number, { people_committed: number; committed_duration: number }>> {
    if (peopleGroupIds.length === 0) {
      return new Map()
    }

    const placeholders = peopleGroupIds.map(() => '?').join(', ')
    const stmt = this.db.prepare(`
      SELECT
        people_group_id,
        COUNT(*) as people_committed,
        COALESCE(SUM(prayer_duration), 0) as committed_duration
      FROM campaign_subscriptions
      WHERE people_group_id IN (${placeholders}) AND status = 'active'
      GROUP BY people_group_id
    `)
    const results = await stmt.all(...peopleGroupIds) as Array<{
      people_group_id: number
      people_committed: number
      committed_duration: number
    }>

    const statsMap = new Map<number, { people_committed: number; committed_duration: number }>()

    // Initialize all IDs with zeros
    for (const id of peopleGroupIds) {
      statsMap.set(id, { people_committed: 0, committed_duration: 0 })
    }

    // Fill in actual values
    for (const row of results) {
      statsMap.set(row.people_group_id, {
        people_committed: row.people_committed,
        committed_duration: row.committed_duration
      })
    }

    return statsMap
  }

  /**
   * Get global commitment stats across all people groups (active subscriptions).
   */
  async getGlobalCommitmentStats(): Promise<{ people_committed: number; committed_duration: number }> {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as people_committed,
        COALESCE(SUM(prayer_duration), 0) as committed_duration
      FROM campaign_subscriptions
      WHERE status = 'active'
    `)
    const result = await stmt.get() as { people_committed: number; committed_duration: number }
    return {
      people_committed: result.people_committed,
      committed_duration: result.committed_duration
    }
  }

  /**
   * Mark that a follow-up email was sent for a subscription.
   * Increments followup_reminder_count and sets last_followup_at.
   */
  async markFollowupSent(subscriptionId: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET
        last_followup_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
        followup_reminder_count = followup_reminder_count + 1,
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(subscriptionId)
  }

  /**
   * Complete a follow-up cycle (subscriber responded or activity detected).
   * Increments followup_count and resets followup_reminder_count.
   */
  async completeFollowupCycle(subscriptionId: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET
        followup_count = followup_count + 1,
        followup_reminder_count = 0,
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(subscriptionId)
  }

  /**
   * Reset follow-up reminders when activity is detected during escalation.
   */
  async resetFollowupReminders(subscriptionId: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET
        followup_reminder_count = 0,
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(subscriptionId)
  }

  /**
   * Reset all follow-up tracking when reactivating a subscription.
   */
  async resetFollowupTracking(subscriptionId: number): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE campaign_subscriptions
      SET
        followup_count = 0,
        followup_reminder_count = 0,
        last_followup_at = NULL,
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE id = ?
    `)
    await stmt.run(subscriptionId)
  }

  /**
   * Get subscription with follow-up details for the API response.
   */
  async getSubscriptionWithFollowupDetails(subscriptionId: number): Promise<PeopleGroupSubscription & {
    last_followup_at: string | null
    followup_count: number
    followup_reminder_count: number
  } | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM campaign_subscriptions WHERE id = ?
    `)
    return await stmt.get(subscriptionId) as any
  }
}

export const peopleGroupSubscriptionService = new PeopleGroupSubscriptionService()
