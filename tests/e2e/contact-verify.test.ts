import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroupSubscription,
  getTestSubscription,
  setVerificationToken
} from '../helpers/db'

// Verifying an email through a non-prayer flow (here: the contact form) must
// still promote any stranded pending prayer subscriptions, via the shared
// `contact.verified` hook. See issue #86.
describe('GET /api/contact/verify (cross-flow subscription activation)', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  it('activates a pending prayer subscription and schedules its reminder', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Cross Flow Verify' })
    const contact = await createTestContactMethod(sql, subscriber.id, {
      type: 'email',
      value: `cross-flow-${Date.now()}@example.com`,
      verified: false
    })

    const subscription = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      delivery_method: 'email',
      frequency: 'daily',
      time_preference: '09:00'
    })
    // Put it in the stranded state: pending signup, no reminder scheduled.
    await sql`
      UPDATE campaign_subscriptions
      SET status = 'pending', next_reminder_utc = NULL
      WHERE id = ${subscription.id}
    `

    const token = uuidv4()
    const futureDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
    await setVerificationToken(sql, contact.id, token, futureDate)

    await $fetch(`/api/contact/verify?token=${token}`, { method: 'GET' })

    const updated = await getTestSubscription(sql, peopleGroup.id, subscriber.id)
    expect(updated!.status).toBe('active')
    expect(updated!.next_reminder_utc).not.toBeNull()
  })

  it('does not activate subscriptions when a phone contact is verified', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Phone Verify' })
    const phone = await createTestContactMethod(sql, subscriber.id, {
      type: 'phone',
      value: `+1555${Date.now().toString().slice(-7)}`,
      verified: false
    })

    const subscription = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      delivery_method: 'email',
      frequency: 'daily',
      time_preference: '09:00'
    })
    await sql`
      UPDATE campaign_subscriptions
      SET status = 'pending', next_reminder_utc = NULL
      WHERE id = ${subscription.id}
    `

    const token = uuidv4()
    const futureDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
    await setVerificationToken(sql, phone.id, token, futureDate)

    await $fetch(`/api/contact/verify?token=${token}`, { method: 'GET' })

    // The email is still unverified, so the pending subscription must stay pending.
    const updated = await getTestSubscription(sql, peopleGroup.id, subscriber.id)
    expect(updated!.status).toBe('pending')
    expect(updated!.next_reminder_utc).toBeNull()
  })
})
