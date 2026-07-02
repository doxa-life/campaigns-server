import { getSql } from './db'

export interface PushSubscription {
  id: number
  subscriber_id: number
  onesignal_subscription_id: string
  external_id: string | null
  platform: string | null
  created_at: string
  updated_at: string
}

class PushSubscriptionService {
  private sql = getSql()

  /**
   * Upsert a device's OneSignal subscription. Keyed by the OneSignal
   * subscription id, so re-registering the same device (reinstall, permission
   * re-grant, external-id change) updates the existing row instead of creating
   * a duplicate.
   */
  async upsert(input: {
    subscriberId: number
    oneSignalSubscriptionId: string
    externalId?: string | null
    platform?: string | null
  }): Promise<PushSubscription> {
    const [row] = await this.sql<PushSubscription[]>`
      INSERT INTO push_subscriptions
        (subscriber_id, onesignal_subscription_id, external_id, platform)
      VALUES (
        ${input.subscriberId},
        ${input.oneSignalSubscriptionId},
        ${input.externalId ?? null},
        ${input.platform ?? null}
      )
      ON CONFLICT (onesignal_subscription_id) DO UPDATE SET
        subscriber_id = EXCLUDED.subscriber_id,
        external_id = EXCLUDED.external_id,
        platform = EXCLUDED.platform,
        updated_at = now()
      RETURNING *
    `
    return row!
  }

  async getBySubscriberId(subscriberId: number): Promise<PushSubscription[]> {
    return await this.sql<PushSubscription[]>`
      SELECT * FROM push_subscriptions
      WHERE subscriber_id = ${subscriberId}
      ORDER BY updated_at DESC
    `
  }
}

export const pushSubscriptionService = new PushSubscriptionService()
