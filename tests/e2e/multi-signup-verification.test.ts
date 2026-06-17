import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  getTestContactMethod,
  getTestSubscription,
  getTestSubscriberByEmail
} from '../helpers/db'

/**
 * Regression: a subscriber may sign up to several people groups before verifying
 * their email. The verification token is shared across all of their signups, so a
 * follow-on signup must not invalidate the link already mailed for an earlier one,
 * and verifying any one link activates every pending subscription.
 */
describe('Multi-group signup email verification', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  const signup = (slug: string, email: string) =>
    $fetch(`/api/people-groups/${slug}/signup`, {
      method: 'POST',
      body: {
        name: 'Multi Signup',
        email,
        delivery_method: 'email',
        frequency: 'daily',
        reminder_time: '09:00'
      }
    })

  it("keeps the first signup's verification link valid after signing up to more groups", async () => {
    const groupA = await createTestPeopleGroup(sql)
    const groupB = await createTestPeopleGroup(sql)
    const email = `multi-verify-${Date.now()}@example.com`

    await signup(groupA.slug, email)
    const subscriber = (await getTestSubscriberByEmail(sql, email))!
    const afterFirst = (await getTestContactMethod(sql, subscriber.id, 'email'))!
    const firstToken = afterFirst.verification_token
    expect(firstToken).toBeTruthy()
    expect(afterFirst.verified).toBe(false)

    // Second signup to a different group must reuse — not overwrite — the shared token.
    await signup(groupB.slug, email)
    const afterSecond = (await getTestContactMethod(sql, subscriber.id, 'email'))!
    expect(afterSecond.verification_token).toBe(firstToken)

    // The link from the FIRST email still verifies.
    const response = await $fetch(`/api/people-groups/${groupA.slug}/verify?token=${firstToken}`, {
      method: 'GET'
    })
    expect(response.message).toBe('Email verified successfully')

    // Verifying once activates the pending subscriptions for BOTH groups.
    const subA = await getTestSubscription(sql, groupA.id, subscriber.id)
    const subB = await getTestSubscription(sql, groupB.id, subscriber.id)
    expect(subA!.status).toBe('active')
    expect(subB!.status).toBe('active')
  })

  it('a repeat signup to the same group keeps the outstanding verification link usable', async () => {
    const group = await createTestPeopleGroup(sql)
    const email = `retry-verify-${Date.now()}@example.com`

    await signup(group.slug, email)
    const subscriber = (await getTestSubscriberByEmail(sql, email))!
    const firstToken = (await getTestContactMethod(sql, subscriber.id, 'email'))!.verification_token
    expect(firstToken).toBeTruthy()

    // Re-signing up to the same group (e.g. the first email never arrived) must
    // not invalidate the link already in their inbox.
    await signup(group.slug, email)
    const afterRetry = (await getTestContactMethod(sql, subscriber.id, 'email'))!
    expect(afterRetry.verified).toBe(false)
    expect(afterRetry.verification_token).toBe(firstToken)

    const response = await $fetch(`/api/people-groups/${group.slug}/verify?token=${firstToken}`, {
      method: 'GET'
    })
    expect(response.message).toBe('Email verified successfully')
  })
})
