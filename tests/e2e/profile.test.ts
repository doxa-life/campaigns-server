import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestPeopleGroupSubscription
} from '../helpers/db'

describe('PUT /api/profile/[id] — change subscribed people group', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  it('moves the subscription to the requested people group (repoint in place)', async () => {
    const groupA = await createTestPeopleGroup(sql)
    const groupB = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql)
    const sub = await createTestPeopleGroupSubscription(sql, groupA.id, subscriber.id, {
      delivery_method: 'app'
    })

    const res = await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { subscription_id: sub.id, people_group_slug: groupB.slug }
    })

    // Same subscription id, now pointed at group B.
    expect(res.currentSubscription.id).toBe(sub.id)

    const [moved] = await sql`SELECT * FROM campaign_subscriptions WHERE id = ${sub.id}`
    expect(moved.people_group_id).toBe(groupB.id)

    // Group A no longer has any subscription for this subscriber.
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM campaign_subscriptions
      WHERE subscriber_id = ${subscriber.id} AND people_group_id = ${groupA.id}
    `
    expect(count).toBe(0)
  })

  it('returns 404 for an unknown people group slug', async () => {
    const group = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql)
    const sub = await createTestPeopleGroupSubscription(sql, group.id, subscriber.id, {
      delivery_method: 'app'
    })

    const error = await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { subscription_id: sub.id, people_group_slug: 'does-not-exist-slug' }
    }).catch(e => e)

    expect(error.statusCode).toBe(404)
  })

  it('merges into an existing app subscription for the target group, removing the old row', async () => {
    const groupA = await createTestPeopleGroup(sql)
    const groupB = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql)
    const subA = await createTestPeopleGroupSubscription(sql, groupA.id, subscriber.id, {
      delivery_method: 'app',
      frequency: 'daily'
    })
    const subB = await createTestPeopleGroupSubscription(sql, groupB.id, subscriber.id, {
      delivery_method: 'app',
      frequency: 'daily'
    })

    // Move A into B with a new schedule; B already has an app row, so this must
    // merge rather than violate the app uniqueness index.
    const res = await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: {
        subscription_id: subA.id,
        people_group_slug: groupB.slug,
        frequency: 'weekly',
        days_of_week: [1, 3, 5]
      }
    })

    // Survivor is group B's existing row, with the incoming schedule applied.
    expect(res.currentSubscription.id).toBe(subB.id)
    expect(res.currentSubscription.frequency).toBe('weekly')

    // The moved-from row is gone.
    const [gone] = await sql`SELECT * FROM campaign_subscriptions WHERE id = ${subA.id}`
    expect(gone).toBeUndefined()

    // Exactly one app row remains for (subscriber, group B).
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM campaign_subscriptions
      WHERE subscriber_id = ${subscriber.id}
        AND people_group_id = ${groupB.id}
        AND delivery_method = 'app'
    `
    expect(count).toBe(1)
  })

  it('returns 403 when the subscription belongs to another subscriber', async () => {
    const group = await createTestPeopleGroup(sql)
    const groupB = await createTestPeopleGroup(sql)
    const owner = await createTestSubscriber(sql)
    const other = await createTestSubscriber(sql)
    const ownerSub = await createTestPeopleGroupSubscription(sql, group.id, owner.id, {
      delivery_method: 'app'
    })

    const error = await $fetch(`/api/profile/${other.profile_id}`, {
      method: 'PUT',
      body: { subscription_id: ownerSub.id, people_group_slug: groupB.slug }
    }).catch(e => e)

    expect(error.statusCode).toBe(403)
  })

  it('moves the subscription via an explicit people_group_id', async () => {
    const groupA = await createTestPeopleGroup(sql)
    const groupB = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql)
    const sub = await createTestPeopleGroupSubscription(sql, groupA.id, subscriber.id, {
      delivery_method: 'app'
    })

    const res = await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { subscription_id: sub.id, people_group_id: groupB.id }
    })

    expect(res.currentSubscription.id).toBe(sub.id)
    const [moved] = await sql`SELECT * FROM campaign_subscriptions WHERE id = ${sub.id}`
    expect(moved.people_group_id).toBe(groupB.id)
  })

  it('returns 404 for an unknown people_group_id', async () => {
    const group = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql)
    const sub = await createTestPeopleGroupSubscription(sql, group.id, subscriber.id, {
      delivery_method: 'app'
    })

    const error = await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: { subscription_id: sub.id, people_group_id: 999999999 }
    }).catch(e => e)

    expect(error.statusCode).toBe(404)
  })

  it('merges an email subscription into the target group\'s existing email row', async () => {
    const groupA = await createTestPeopleGroup(sql)
    const groupB = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql)
    const subA = await createTestPeopleGroupSubscription(sql, groupA.id, subscriber.id, {
      delivery_method: 'email',
      frequency: 'daily'
    })
    const subB = await createTestPeopleGroupSubscription(sql, groupB.id, subscriber.id, {
      delivery_method: 'email',
      frequency: 'daily'
    })

    // Moving A into B where B already has an email row must merge (not create a
    // duplicate email subscription that would double up reminders).
    const res = await $fetch(`/api/profile/${subscriber.profile_id}`, {
      method: 'PUT',
      body: {
        subscription_id: subA.id,
        people_group_slug: groupB.slug,
        frequency: 'weekly',
        days_of_week: [2, 4]
      }
    })

    expect(res.currentSubscription.id).toBe(subB.id)
    expect(res.currentSubscription.frequency).toBe('weekly')

    const [gone] = await sql`SELECT * FROM campaign_subscriptions WHERE id = ${subA.id}`
    expect(gone).toBeUndefined()

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM campaign_subscriptions
      WHERE subscriber_id = ${subscriber.id}
        AND people_group_id = ${groupB.id}
        AND delivery_method = 'email'
    `
    expect(count).toBe(1)
  })
})
