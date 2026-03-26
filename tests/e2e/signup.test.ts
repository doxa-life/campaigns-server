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
  getTestContactMethod,
  getTestSubscription,
  getAllTestSubscriptions,
  getTestSubscriberByEmail
} from '../helpers/db'

describe('POST /api/people-groups/[slug]/signup', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  describe('Validation', () => {
    it('returns 404 for non-existent people group', async () => {
      const error = await $fetch('/api/people-groups/non-existent-people-group/signup', {
        method: 'POST',
        body: {
          name: 'Test User',
          email: 'test@example.com',
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      }).catch(e => e)

      expect(error.statusCode).toBe(404)
      expect(error.statusMessage).toBe('People group not found')
    })

    it('returns 400 for missing required fields', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)

      const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test User'
        }
      }).catch(e => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toContain('Missing required fields')
    })

    it('returns 400 when email missing for email delivery', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)

      const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test User',
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      }).catch(e => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toBe('Email is required for email delivery')
    })

    it('returns 400 when phone missing for WhatsApp delivery', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)

      const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test User',
          delivery_method: 'whatsapp',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      }).catch(e => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toBe('Phone number is required for WhatsApp delivery')
    })

    it('returns 400 when days_of_week missing for weekly frequency', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)

      const error = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test User',
          email: 'test@example.com',
          delivery_method: 'email',
          frequency: 'weekly',
          reminder_time: '09:00'
        }
      }).catch(e => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toBe('Days of week are required for weekly frequency')
    })
  })

  describe('New Subscriber', () => {
    it('creates subscriber + contact method + subscription for new email', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const email = `test-new-${Date.now()}@example.com`

      const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test New User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00',
          timezone: 'America/New_York'
        }
      })

      expect(response.message).toBe('Please check your email to complete your signup')

      // Verify subscriber was created
      const subscriber = await getTestSubscriberByEmail(sql, email)
      expect(subscriber).toBeDefined()
      expect(subscriber!.name).toBe('Test New User')

      // Verify contact method was created
      const contactMethod = await getTestContactMethod(sql, subscriber!.id, 'email')
      expect(contactMethod).toBeDefined()
      expect(contactMethod!.value.toLowerCase()).toBe(email.toLowerCase())
      expect(contactMethod!.verified).toBe(false)

      // Verify subscription was created
      const subscription = await getTestSubscription(sql, peopleGroup.id, subscriber!.id)
      expect(subscription).toBeDefined()
      expect(subscription!.delivery_method).toBe('email')
      expect(subscription!.frequency).toBe('daily')
      expect(subscription!.time_preference).toBe('09:00')
      expect(subscription!.timezone).toBe('America/New_York')
      expect(subscription!.status).toBe('pending')
    })

    it('stores email lowercase (case-insensitive)', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const email = `Test-UPPER-${Date.now()}@Example.COM`

      await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Case User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      })

      // Verify we can find the subscriber by lowercase email
      const subscriber = await getTestSubscriberByEmail(sql, email.toLowerCase())
      expect(subscriber).toBeDefined()
    })
  })

  describe('Existing Subscriber', () => {
    it('reuses existing subscriber when email matches', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)

      // Create existing subscriber
      const existingSubscriber = await createTestSubscriber(sql, { name: 'Test Existing User' })
      const email = `test-existing-${Date.now()}@example.com`
      await createTestContactMethod(sql, existingSubscriber.id, { type: 'email', value: email, verified: true })

      const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Existing User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '10:00'
        }
      })

      expect(response.message).toBe('Please check your email to complete your signup')

      // Verify subscription was created for existing subscriber
      const subscription = await getTestSubscription(sql, peopleGroup.id, existingSubscriber.id)
      expect(subscription).toBeDefined()
    })

    it('updates subscriber name if changed', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)

      // Create existing subscriber
      const existingSubscriber = await createTestSubscriber(sql, { name: 'Test Old Name' })
      const email = `test-name-${Date.now()}@example.com`
      await createTestContactMethod(sql, existingSubscriber.id, { type: 'email', value: email, verified: true })

      await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test New Name',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      })

      // Verify name was updated
      const updatedSubscriber = await getTestSubscriberByEmail(sql, email)
      expect(updatedSubscriber).toBeDefined()
      expect(updatedSubscriber!.name).toBe('Test New Name')
    })
  })

  describe('Subscription Limits', () => {
    it('allows up to 5 subscriptions per people group', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Limit User' })
      const email = `test-limit-${Date.now()}@example.com`
      await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

      // Create 4 existing subscriptions with different times
      for (let i = 0; i < 4; i++) {
        await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
          time_preference: `0${i}:00`,
          status: 'active'
        })
      }

      // 5th signup should succeed
      const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Limit User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '05:00'
        }
      })

      expect(response.message).toBe('Please check your email to complete your signup')

      // Verify 5th subscription was created
      const subscriptions = await getAllTestSubscriptions(sql, peopleGroup.id, subscriber.id)
      expect(subscriptions.length).toBe(5)
    })

    it('returns privacy-safe response when at limit', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Limit Max User' })
      const email = `test-limit-max-${Date.now()}@example.com`
      await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

      // Create 5 existing subscriptions (max limit)
      for (let i = 0; i < 5; i++) {
        await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
          time_preference: `0${i}:00`,
          status: 'active'
        })
      }

      // 6th signup should return same response for privacy
      const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Limit Max User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '06:00'
        }
      })

      // Same response as success - privacy protection
      expect(response.message).toBe('Please check your email to complete your signup')

      // Verify no 6th subscription was created
      const subscriptions = await getAllTestSubscriptions(sql, peopleGroup.id, subscriber.id)
      expect(subscriptions.length).toBe(5)
    })
  })

  describe('Duplicate Detection', () => {
    it('detects duplicate frequency + time combo', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Duplicate User' })
      const email = `test-dup-${Date.now()}@example.com`
      await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

      // Create existing subscription
      await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
        frequency: 'daily',
        time_preference: '09:00',
        status: 'active'
      })

      // Attempt duplicate signup
      const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Duplicate User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      })

      // Same response as success - privacy protection
      expect(response.message).toBe('Please check your email to complete your signup')

      // Verify no duplicate subscription was created
      const subscriptions = await getAllTestSubscriptions(sql, peopleGroup.id, subscriber.id)
      expect(subscriptions.length).toBe(1)
    })
  })

  describe('Reactivation', () => {
    it('reactivates unsubscribed subscription with matching schedule', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Reactivate User' })
      const email = `test-reactivate-${Date.now()}@example.com`
      await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

      // Create unsubscribed subscription
      const existing = await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
        frequency: 'daily',
        time_preference: '09:00',
        status: 'unsubscribed'
      })

      // Signup with same schedule
      const response = await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Reactivate User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      })

      expect(response.message).toBe('Please check your email to complete your signup')

      // Verify subscription was reactivated (not a new one created)
      const subscriptions = await getAllTestSubscriptions(sql, peopleGroup.id, subscriber.id)
      expect(subscriptions.length).toBe(1)
      expect(subscriptions[0].id).toBe(existing.id)
      expect(subscriptions[0].status).toBe('active')
    })

    it('updates delivery method on reactivation', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const subscriber = await createTestSubscriber(sql, { name: 'Test Reactivate Delivery User' })
      const email = `test-reactivate-delivery-${Date.now()}@example.com`
      await createTestContactMethod(sql, subscriber.id, { type: 'email', value: email, verified: true })

      // Create unsubscribed subscription with whatsapp
      await createTestPeopleGroupSubscription(sql, peopleGroup.id, subscriber.id, {
        delivery_method: 'whatsapp',
        frequency: 'daily',
        time_preference: '09:00',
        status: 'unsubscribed'
      })

      // Signup with same schedule but email delivery
      await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Reactivate Delivery User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00'
        }
      })

      // Verify delivery method was updated
      const subscription = await getTestSubscription(sql, peopleGroup.id, subscriber.id)
      expect(subscription!.delivery_method).toBe('email')
    })
  })

  describe('Consent', () => {
    it('records people group-specific consent', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const email = `test-consent-${Date.now()}@example.com`

      await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test Consent User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00',
          consent_people_group_updates: true
        }
      })

      // Verify consent was recorded
      const subscriber = await getTestSubscriberByEmail(sql, email)
      const contactMethod = await getTestContactMethod(sql, subscriber!.id, 'email')
      expect(contactMethod!.consented_people_group_ids).toContain(peopleGroup.id)
    })

    it('records DOXA general consent when provided', async () => {
      const peopleGroup = await createTestPeopleGroup(sql)
      const email = `test-doxa-consent-${Date.now()}@example.com`

      await $fetch(`/api/people-groups/${peopleGroup.slug}/signup`, {
        method: 'POST',
        body: {
          name: 'Test DOXA Consent User',
          email,
          delivery_method: 'email',
          frequency: 'daily',
          reminder_time: '09:00',
          consent_doxa_general: true
        }
      })

      // Verify DOXA consent was recorded
      const subscriber = await getTestSubscriberByEmail(sql, email)
      const contactMethod = await getTestContactMethod(sql, subscriber!.id, 'email')
      expect(contactMethod!.consent_doxa_general).toBe(true)
    })
  })
})
