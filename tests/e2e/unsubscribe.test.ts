import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroupSubscription,
  getTestSubscription,
  getAllTestSubscriptions
} from '../helpers/db'

const sql = getTestDatabase()

afterEach(async () => {
  await cleanupTestData(sql)
})

afterAll(async () => {
  await closeTestDatabase()
})

describe('POST /api/people-groups/[slug]/unsubscribe', () => {

  it('returns 400 for missing profile_id', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)

    const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/unsubscribe`, {
      method: 'POST'
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Profile ID is required')
  })

  it('returns 404 for non-existent people group', async () => {
    const error = await $fetch('/api/people-groups/non-existent/unsubscribe?id=some-profile-id', {
      method: 'POST'
    }).catch(e => e)

    expect(error.statusCode).toBe(404)
    expect(error.statusMessage).toBe('People group not found')
  })

  it('returns 404 for non-existent subscriber', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)

    const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/unsubscribe?id=non-existent-profile`, {
      method: 'POST'
    }).catch(e => e)

    expect(error.statusCode).toBe(404)
    expect(error.statusMessage).toBe('Subscription not found')
  })

  it('unsubscribes single subscription', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Unsubscribe Single' })
    const email = `test-unsub-single-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'active'
    })

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/unsubscribe?id=${subscriber.profile_id}`, {
      method: 'POST'
    })

    expect(response.success).toBe(true)
    expect(response.message).toBe('Successfully unsubscribed from this reminder')
    expect(response.already_unsubscribed).toBe(false)

    // Verify subscription is now unsubscribed
    const subscription = await getTestSubscription(sql, peopleGroup.id, subscriber.id)
    expect(subscription!.status).toBe('unsubscribed')
  })

  it('unsubscribes specific subscription by ID', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Unsubscribe Specific' })
    const email = `test-unsub-specific-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Create two subscriptions
    const sub1 = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'active'
    })
    const sub2 = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '18:00',
      status: 'active'
    })

    // Unsubscribe from specific subscription
    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/unsubscribe?id=${subscriber.profile_id}&sid=${sub2.id}`, {
      method: 'POST'
    })

    expect(response.success).toBe(true)
    expect(response.unsubscribed_reminder.id).toBe(sub2.id)

    // Verify only sub2 is unsubscribed
    const subscriptions = await getAllTestSubscriptions(sql, peopleGroup.id, subscriber.id)
    const activeSub = subscriptions.find(s => s.id === sub1.id)
    const unsubscribedSub = subscriptions.find(s => s.id === sub2.id)

    expect(activeSub!.status).toBe('active')
    expect(unsubscribedSub!.status).toBe('unsubscribed')
  })

  it('unsubscribes all people group subscriptions with all=true', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Unsubscribe All' })
    const email = `test-unsub-all-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Create multiple subscriptions
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'active'
    })
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '18:00',
      status: 'active'
    })
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'weekly',
      time_preference: '10:00',
      days_of_week: [1, 3, 5],
      status: 'active'
    })

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/unsubscribe?id=${subscriber.profile_id}&all=true`, {
      method: 'POST'
    })

    expect(response.message).toContain('Unsubscribed from all 3 reminder(s)')
    expect(response.unsubscribed_from_people_group).toBe(true)

    // Verify all subscriptions are unsubscribed
    const subscriptions = await getAllTestSubscriptions(sql, peopleGroup.id, subscriber.id)
    expect(subscriptions.every(s => s.status === 'unsubscribed')).toBe(true)
  })

  it('returns other active people groups in response', async () => {
    const peopleGroup1 = await createTestPeopleGroup(sql, { title: 'Test People Group 1' })
    const peopleGroup2 = await createTestPeopleGroup(sql, { title: 'Test People Group 2' })
    const subscriber = await createTestSubscriber(sql, { name: 'Test Unsubscribe Other' })
    const email = `test-unsub-other-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Subscribe to both people groups
    await createTestPeopleGroupSubscription(sql, peopleGroup1.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'active'
    })
    await createTestPeopleGroupSubscription(sql, peopleGroup2.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '10:00',
      status: 'active'
    })

    // Unsubscribe from peopleGroup1
    const response = await $fetch(`/api/people-groups/${peopleGroup1.slug}/unsubscribe?id=${subscriber.profile_id}`, {
      method: 'POST'
    })

    expect(response.other_people_groups).toBeDefined()
    expect(response.other_people_groups.length).toBe(1)
    expect(response.other_people_groups[0].title).toBe('Test People Group 2')
  })

  it('returns already_unsubscribed for already unsubscribed subscription', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Already Unsubscribed' })
    const email = `test-already-unsub-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Create already unsubscribed subscription
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'unsubscribed'
    })

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/unsubscribe?id=${subscriber.profile_id}`, {
      method: 'POST'
    })

    expect(response.already_unsubscribed).toBe(true)
    expect(response.message).toBe('You have already been unsubscribed')
  })
})

describe('POST /api/people-groups/[slug]/resubscribe', () => {

  it('returns 400 for missing profile_id', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)

    const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: {}
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Profile ID is required')
  })

  it('returns 404 for non-existent people group', async () => {
    const error = await $fetch('/api/people-groups/non-existent/resubscribe', {
      method: 'POST',
      body: { profile_id: 'some-profile-id' }
    }).catch(e => e)

    expect(error.statusCode).toBe(404)
    expect(error.statusMessage).toBe('People group not found')
  })

  it('returns 404 for non-existent subscriber', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)

    const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: 'non-existent-profile' }
    }).catch(e => e)

    expect(error.statusCode).toBe(404)
    expect(error.statusMessage).toBe('Subscription not found')
  })

  it('reactivates unsubscribed subscription', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Resubscribe' })
    const email = `test-resub-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Create unsubscribed subscription
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'unsubscribed'
    })

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id }
    })

    expect(response.message).toBe('Successfully resubscribed to prayer reminders')
    expect(response.already_active).toBe(false)

    // Verify subscription is now active
    const subscription = await getTestSubscription(sql, peopleGroup.id, subscriber.id)
    expect(subscription!.status).toBe('active')
  })

  it('reactivates specific subscription by ID', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Resubscribe Specific' })
    const email = `test-resub-specific-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Create two unsubscribed subscriptions
    const sub1 = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'unsubscribed'
    })
    const sub2 = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '18:00',
      status: 'unsubscribed'
    })

    // Resubscribe to specific subscription
    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: {
        profile_id: subscriber.profile_id,
        subscription_id: sub2.id
      }
    })

    expect(response.message).toBe('Successfully resubscribed to prayer reminders')

    // Verify only sub2 is reactivated
    const subscriptions = await getAllTestSubscriptions(sql, peopleGroup.id, subscriber.id)
    const stillUnsubscribed = subscriptions.find(s => s.id === sub1.id)
    const reactivated = subscriptions.find(s => s.id === sub2.id)

    expect(stillUnsubscribed!.status).toBe('unsubscribed')
    expect(reactivated!.status).toBe('active')
  })

  it('recalculates next_reminder_utc on reactivation', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Resubscribe Reminder' })
    const email = `test-resub-reminder-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Create unsubscribed subscription (no next_reminder_utc)
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'unsubscribed'
    })

    await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id }
    })

    // Verify next_reminder_utc was set
    const subscription = await getTestSubscription(sql, peopleGroup.id, subscriber.id)
    expect(subscription!.next_reminder_utc).not.toBeNull()
  })

  it('returns already_active for active subscription', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Already Active' })
    const email = `test-already-active-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    // Create active subscription
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'active'
    })

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id }
    })

    expect(response.message).toBe('Subscription is already active')
    expect(response.already_active).toBe(true)
  })

  it('returns people group info on success', async () => {
    const peopleGroup = await createTestPeopleGroup(sql, {
      title: 'Test Resubscribe People Group'
    })
    const subscriber = await createTestSubscriber(sql, { name: 'Test Resubscribe Info' })
    const email = `test-resub-info-${Date.now()}@example.com`
    await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      frequency: 'daily',
      time_preference: '09:00',
      status: 'unsubscribed'
    })

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/resubscribe`, {
      method: 'POST',
      body: { profile_id: subscriber.profile_id }
    })

    expect(response.people_group_name).toBe('Test Resubscribe People Group')
    expect(response.people_group_slug).toBe(peopleGroup.slug)
  })
})
