import { getSql } from './db'

export interface FollowupResponse {
  id: number
  subscription_id: number
  response: 'committed' | 'sometimes' | 'not_praying'
  followup_sent_at: string
  responded_at: string
  created_at: string
}

export interface SubscriptionForFollowup {
  id: number
  people_group_id: number
  subscriber_id: number
  frequency: string
  days_of_week: string | null
  status: 'active' | 'inactive' | 'unsubscribed' | 'pending'
  last_followup_at: string | null
  followup_count: number
  followup_reminder_count: number
  created_at: string
  subscriber_name: string
  subscriber_tracking_id: string
  subscriber_profile_id: string
  subscriber_language: string
  email_value: string
  people_group_slug: string
  people_group_name: string
  last_activity_at: string | null
}

class FollowupTrackingService {
  private sql = getSql()

  async getLastActivityAt(subscriberId: number, peopleGroupId: number): Promise<string | null> {
    const [result] = await this.sql`
      SELECT MAX(pa.timestamp) as last_activity_at
      FROM prayer_activity pa
      JOIN subscribers s ON pa.tracking_id = s.tracking_id
      WHERE s.id = ${subscriberId} AND pa.people_group_id = ${peopleGroupId}
    `
    return result?.last_activity_at || null
  }

  async getActiveSubscriptionsForFollowup(): Promise<SubscriptionForFollowup[]> {
    return await this.sql`
      SELECT
        cs.id,
        cs.people_group_id,
        cs.subscriber_id,
        cs.frequency,
        cs.days_of_week,
        cs.status,
        cs.last_followup_at,
        cs.followup_count,
        cs.followup_reminder_count,
        cs.created_at,
        s.name as subscriber_name,
        s.tracking_id as subscriber_tracking_id,
        s.profile_id as subscriber_profile_id,
        s.preferred_language as subscriber_language,
        cm.value as email_value,
        pg.slug as people_group_slug,
        pg.name as people_group_name,
        (
          SELECT MAX(pa.timestamp)
          FROM prayer_activity pa
          WHERE pa.tracking_id = s.tracking_id AND pa.people_group_id = cs.people_group_id
        ) as last_activity_at
      FROM campaign_subscriptions cs
      JOIN subscribers s ON s.id = cs.subscriber_id
      JOIN people_groups pg ON pg.id = cs.people_group_id
      LEFT JOIN contact_methods cm ON cm.subscriber_id = s.id AND cm.type = 'email'
      WHERE cs.status = 'active'
        AND cs.delivery_method = 'email'
        AND cm.verified = true
      ORDER BY cs.created_at ASC
    `
  }

  async recordResponse(
    subscriptionId: number,
    response: 'committed' | 'sometimes' | 'not_praying',
    followupSentAt: Date
  ): Promise<FollowupResponse> {
    const [row] = await this.sql`
      INSERT INTO followup_responses (subscription_id, response, followup_sent_at)
      VALUES (${subscriptionId}, ${response}, ${followupSentAt.toISOString()})
      RETURNING *
    `
    return row as FollowupResponse
  }

  async getLatestResponse(subscriptionId: number): Promise<FollowupResponse | null> {
    const [row] = await this.sql`
      SELECT * FROM followup_responses
      WHERE subscription_id = ${subscriptionId}
      ORDER BY created_at DESC
      LIMIT 1
    `
    return (row as FollowupResponse) || null
  }

  async getResponseHistory(subscriptionId: number): Promise<FollowupResponse[]> {
    return await this.sql`
      SELECT * FROM followup_responses
      WHERE subscription_id = ${subscriptionId}
      ORDER BY created_at DESC
    `
  }

  async hasActivitySinceLastFollowup(subscriptionId: number): Promise<boolean> {
    const [result] = await this.sql`
      SELECT EXISTS (
        SELECT 1
        FROM prayer_activity pa
        JOIN subscribers s ON pa.tracking_id = s.tracking_id
        JOIN campaign_subscriptions cs ON cs.subscriber_id = s.id AND cs.people_group_id = pa.people_group_id
        WHERE cs.id = ${subscriptionId}
          AND cs.last_followup_at IS NOT NULL
          AND pa.timestamp > cs.last_followup_at
      ) as has_activity
    `
    return result?.has_activity || false
  }
}

export const followupTrackingService = new FollowupTrackingService()
