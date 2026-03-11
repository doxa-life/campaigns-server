import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
} from '../../../helpers/db'
import { createAdminUser, createNoRoleUser } from '../../../helpers/auth'

describe('POST /api/admin/subscribers', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('returns 401 for unauthenticated requests', async () => {
    const error = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: { name: 'Test New Sub' }
    }).catch((e) => e)
    expect(error.statusCode).toBe(401)
  })

  it('returns 403 for users with no role', async () => {
    const error = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: { name: 'Test New Sub' },
      ...noRoleAuth
    }).catch((e) => e)
    expect(error.statusCode).toBe(403)
  })

  it('returns 400 when name is missing', async () => {
    const error = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: { name: '' },
      ...adminAuth
    }).catch((e) => e)
    expect(error.statusCode).toBe(400)
  })

  it('creates a new subscriber', async () => {
    const response = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: { name: 'Test Created Sub' },
      ...adminAuth
    })

    expect(response.subscriber).toBeDefined()
    expect(response.subscriber.name).toBe('Test Created Sub')
    expect(response.isNew).toBe(true)
  })

  it('creates a subscriber with email and phone', async () => {
    const email = `test-create-${Date.now()}@example.com`
    const response = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: {
        name: 'Test Sub With Contact',
        email,
        phone: '+1234567890'
      },
      ...adminAuth
    })

    expect(response.subscriber).toBeDefined()
    expect(response.isNew).toBe(true)
  })

  it('creates a subscriber with a role', async () => {
    const response = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: {
        name: 'Test Sub With Role',
        role: 'leader'
      },
      ...adminAuth
    })

    expect(response.subscriber).toBeDefined()
  })

  it('finds existing subscriber by email', async () => {
    const email = `test-findorcreate-${Date.now()}@example.com`

    // Create first
    const first = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: { name: 'Test Existing Sub', email },
      ...adminAuth
    })
    expect(first.isNew).toBe(true)

    // Create again with same email
    const second = await $fetch('/api/admin/subscribers', {
      method: 'POST',
      body: { name: 'Test Existing Sub', email },
      ...adminAuth
    })
    expect(second.isNew).toBe(false)
    expect(second.subscriber.id).toBe(first.subscriber.id)
  })
})
