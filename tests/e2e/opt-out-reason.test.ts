import { describe, it, expect, afterAll, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroupSubscription
} from '../helpers/db'

const sql = getTestDatabase()

// The shared helper looks a subscription up by people group and subscriber; these
// cases need a specific row, including several rows for one pair.
async function subscriptionById(id: number) {
  const [row] = await sql`SELECT * FROM campaign_subscriptions WHERE id = ${id}`
  return row as {
    status: string
    reminders_paused: boolean
    opt_out_reason: string | null
    opt_out_reason_text: string | null
    opt_out_reason_at: string | null
  }
}

afterEach(async () => {
  await cleanupTestData(sql)
})

afterAll(async () => {
  await closeTestDatabase()
})

async function subscriberWithSubscription(timePreference = '09:00') {
  const peopleGroup = await createTestPeopleGroup(sql)
  const subscriber = await createTestSubscriber(sql, { name: 'Opt Out Reason' })
  await createTestContactMethod(sql, subscriber.id, {
    type: 'email',
    value: `opt-out-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    verified: true
  })
  const subscription = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
    frequency: 'daily',
    time_preference: timePreference,
    status: 'active'
  })
  return { peopleGroup, subscriber, subscription }
}

describe('POST /api/subscriptions/opt-out-reason', () => {

  it('returns 400 for missing profile_id', async () => {
    const error = await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: { subscription_ids: [1], reason: 'wrong_time' }
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Profile ID is required')
  })

  it('rejects a reason key that is not in the configured set', async () => {
    const { subscriber, subscription } = await subscriberWithSubscription()

    const error = await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: subscriber.profile_id,
        subscription_ids: [subscription.id],
        reason: 'made_up_reason'
      }
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Invalid reason')
  })

  it('returns 400 when no subscription ids are given', async () => {
    const { subscriber } = await subscriberWithSubscription()

    const error = await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: { profile_id: subscriber.profile_id, subscription_ids: [], reason: 'wrong_time' }
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
  })

  it('records a fixed reason on the subscription', async () => {
    const { subscriber, subscription } = await subscriberWithSubscription()

    const response = await $fetch<{ success: boolean, subscription_ids: number[] }>(
      '/api/subscriptions/opt-out-reason',
      {
        method: 'POST',
        body: {
          profile_id: subscriber.profile_id,
          subscription_ids: [subscription.id],
          reason: 'wrong_time'
        }
      }
    )

    expect(response.success).toBe(true)
    expect(response.subscription_ids).toEqual([subscription.id])

    const row = await subscriptionById(subscription.id)
    expect(row.opt_out_reason).toBe('wrong_time')
    expect(row.opt_out_reason_text).toBeNull()
    expect(row.opt_out_reason_at).not.toBeNull()
  })

  it('keeps free text only for the other reason', async () => {
    const { subscriber, subscription } = await subscriberWithSubscription()

    await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: subscriber.profile_id,
        subscription_ids: [subscription.id],
        reason: 'other',
        reason_text: 'Moved to a different prayer group at church'
      }
    })

    let row = await subscriptionById(subscription.id)
    expect(row.opt_out_reason).toBe('other')
    expect(row.opt_out_reason_text).toBe('Moved to a different prayer group at church')

    // A fixed choice never shows free text next to it, so it is dropped.
    await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: subscriber.profile_id,
        subscription_ids: [subscription.id],
        reason: 'life_busy',
        reason_text: 'stray note'
      }
    })

    row = await subscriptionById(subscription.id)
    expect(row.opt_out_reason).toBe('life_busy')
    expect(row.opt_out_reason_text).toBeNull()
  })

  it('rejects free text longer than the cap', async () => {
    const { subscriber, subscription } = await subscriberWithSubscription()

    const error = await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: subscriber.profile_id,
        subscription_ids: [subscription.id],
        reason: 'other',
        reason_text: 'x'.repeat(301)
      }
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
  })

  it('refuses to write a reason onto another subscriber rows', async () => {
    const mine = await subscriberWithSubscription('07:00')
    const theirs = await subscriberWithSubscription('08:00')

    const error = await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: mine.subscriber.profile_id,
        subscription_ids: [theirs.subscription.id],
        reason: 'wrong_time'
      }
    }).catch(e => e)

    expect(error.statusCode).toBe(403)

    const row = await subscriptionById(theirs.subscription.id)
    expect(row.opt_out_reason).toBeNull()
  })
})

describe('opt-out reason lifecycle', () => {

  it('records the mute reason without being asked', async () => {
    const { peopleGroup, subscriber, subscription } = await subscriberWithSubscription()

    await $fetch(`/api/people-groups/${peopleGroup.slug}/reminder/${subscription.id}/stop`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id, action: 'mute' }
    })

    const row = await subscriptionById(subscription.id)
    expect(row.reminders_paused).toBe(true)
    expect(row.status).toBe('active')
    expect(row.opt_out_reason).toBe('emails_only')
  })

  it('clears the reason when a muted reminder is resumed', async () => {
    const { peopleGroup, subscriber, subscription } = await subscriberWithSubscription()

    await $fetch(`/api/people-groups/${peopleGroup.slug}/reminder/${subscription.id}/stop`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id, action: 'mute' }
    })
    await $fetch(`/api/people-groups/${peopleGroup.slug}/reminder/${subscription.id}/resume`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id }
    })

    const row = await subscriptionById(subscription.id)
    expect(row.opt_out_reason).toBeNull()
    expect(row.opt_out_reason_at).toBeNull()
  })

  it('clears the reason when a stopped prayer time is resubscribed', async () => {
    const { peopleGroup, subscriber, subscription } = await subscriberWithSubscription()

    await $fetch(`/api/people-groups/${peopleGroup.slug}/reminder/${subscription.id}/stop`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id, action: 'not_praying' }
    })
    await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: subscriber.profile_id,
        subscription_ids: [subscription.id],
        reason: 'life_busy'
      }
    })

    let row = await subscriptionById(subscription.id)
    expect(row.opt_out_reason).toBe('life_busy')

    await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id, subscription_id: subscription.id }
    })

    row = await subscriptionById(subscription.id)
    expect(row.opt_out_reason).toBeNull()
    expect(row.opt_out_reason_text).toBeNull()
    expect(row.opt_out_reason_at).toBeNull()
  })

  it('reports the prayer times a whole-people-group stop ended', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Stop All Reason' })
    await createTestContactMethod(sql, subscriber.id, {
      type: 'email',
      value: `stop-all-${Date.now()}@example.com`,
      verified: true
    })
    const morning = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '07:00',
      status: 'active'
    })
    const evening = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '19:00',
      status: 'active'
    })

    const stopped = await $fetch<{ stopped_subscription_ids: number[] }>(
      `/api/people-groups/${peopleGroup.slug}/stop-all`,
      { method: 'POST', body: { profile_id: subscriber.profile_id } }
    )

    expect(stopped.stopped_subscription_ids.sort()).toEqual([morning.id, evening.id].sort())

    await $fetch('/api/subscriptions/opt-out-reason', {
      method: 'POST',
      body: {
        profile_id: subscriber.profile_id,
        subscription_ids: stopped.stopped_subscription_ids,
        reason: 'different_people_group'
      }
    })

    for (const id of [morning.id, evening.id]) {
      const row = await subscriptionById(id)
      expect(row.opt_out_reason).toBe('different_people_group')
    }
  })
})
