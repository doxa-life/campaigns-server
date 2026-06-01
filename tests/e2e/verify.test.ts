import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
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
  getTestContactMethod,
  getTestSubscription,
  setVerificationToken
} from '../helpers/db'

describe('GET /api/people-groups/[slug]/verify', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  it('returns 400 for missing token', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)

    const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/verify`, {
      method: 'GET'
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Verification token is required')
  })

  it('returns 400 for invalid token', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)

    const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/verify?token=invalid-token-123`, {
      method: 'GET'
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Invalid verification token')
  })

  it('returns 400 for expired token (7 days)', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Verify Expired' })
    const email = `test-verify-expired-${Date.now()}@example.com`
    const contact = await createTestContactMethod(sql, subscriber.id, {
      type: 'email',
      value: email,
      verified: false
    })

    // Set token with past expiration
    const token = uuidv4()
    const expiredDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
    await setVerificationToken(sql, contact.id, token, expiredDate)

    const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/verify?token=${token}`, {
      method: 'GET'
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Verification token has expired')
  })

  it('marks email as verified for valid token', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Verify Valid' })
    const email = `test-verify-valid-${Date.now()}@example.com`
    const contact = await createTestContactMethod(sql, subscriber.id, {
      type: 'email',
      value: email,
      verified: false
    })

    // Set valid token
    const token = uuidv4()
    const futureDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) // 6 days from now
    await setVerificationToken(sql, contact.id, token, futureDate)

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/verify?token=${token}`, {
      method: 'GET'
    })

    expect(response.message).toBe('Email verified successfully')

    // Verify contact method is now verified
    const updatedContact = await getTestContactMethod(sql, subscriber.id, 'email')
    expect(updatedContact!.verified).toBe(true)
    expect(updatedContact!.verification_token).toBe(token)
  })

  it('sets initial next_reminder_utc on verification', async () => {
    const peopleGroup = await createTestPeopleGroup(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Verify Reminder' })
    const email = `test-verify-reminder-${Date.now()}@example.com`
    const contact = await createTestContactMethod(sql, subscriber.id, {
      type: 'email',
      value: email,
      verified: false
    })

    // Create subscription without next_reminder_utc (simulating pre-verification state)
    await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
      delivery_method: 'email',
      frequency: 'daily',
      time_preference: '09:00',
      status: 'active'
    })

    // Set valid token
    const token = uuidv4()
    const futureDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) // 6 days from now
    await setVerificationToken(sql, contact.id, token, futureDate)

    await $fetch(`/api/people-groups/${peopleGroup.slug}/verify?token=${token}`, {
      method: 'GET'
    })

    // Verify next_reminder_utc was set
    const subscription = await getTestSubscription(sql, peopleGroup.id, subscriber.id)
    expect(subscription!.next_reminder_utc).not.toBeNull()
  })

  it('returns people group info on success', async () => {
    const peopleGroup = await createTestPeopleGroup(sql, {

      title: 'Test Verify People Group'
    })
    const subscriber = await createTestSubscriber(sql, { name: 'Test Verify Info' })
    const email = `test-verify-info-${Date.now()}@example.com`
    const contact = await createTestContactMethod(sql, subscriber.id, {
      type: 'email',
      value: email,
      verified: false
    })

    // Set valid token
    const token = uuidv4()
    const futureDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) // 6 days from now
    await setVerificationToken(sql, contact.id, token, futureDate)

    const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/verify?token=${token}`, {
      method: 'GET'
    })

    expect(response.people_group_name).toBe('Test Verify People Group')
    expect(response.people_group_slug).toBe(peopleGroup.slug)
  })

  it('returns 404 for non-existent people group', async () => {
    const error = await $fetch('/api/people-groups/non-existent/verify?token=some-token', {
      method: 'GET'
    }).catch(e => e)

    expect(error.statusCode).toBe(404)
    expect(error.statusMessage).toBe('People group not found')
  })
})
