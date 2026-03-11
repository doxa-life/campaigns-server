import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber,
  createTestContactMethod,
  createTestGroup,
} from '../../../helpers/db'
import { createAdminUser, createNoRoleUser } from '../../../helpers/auth'

describe('Group Subscribers API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let group: { id: number; name: string }
  let subscriber: { id: number; name: string }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth

    group = await createTestGroup(sql, { name: 'Test Group Subs' })

    subscriber = await createTestSubscriber(sql, { name: 'Test Sub For Group' })
    await createTestContactMethod(sql, subscriber.id, {
      value: `test-group-sub-${Date.now()}@example.com`,
      verified: true
    })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('POST /api/admin/groups/[id]/subscribers', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/subscribers`, {
        method: 'POST',
        body: { subscriber_id: subscriber.id }
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/subscribers`, {
        method: 'POST',
        body: { subscriber_id: subscriber.id },
        ...noRoleAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 400 when subscriber_id is missing', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/subscribers`, {
        method: 'POST',
        body: {},
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('returns 404 when group does not exist', async () => {
      const error = await $fetch('/api/admin/groups/999999/subscribers', {
        method: 'POST',
        body: { subscriber_id: subscriber.id },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('returns 404 when subscriber does not exist', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/subscribers`, {
        method: 'POST',
        body: { subscriber_id: 999999 },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('adds a subscriber to a group', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}/subscribers`, {
        method: 'POST',
        body: { subscriber_id: subscriber.id },
        ...adminAuth
      })

      expect(response.connection).toBeDefined()
      expect(response.connection.from_type).toBe('subscriber')
      expect(response.connection.from_id).toBe(subscriber.id)
      expect(response.connection.to_type).toBe('group')
      expect(response.connection.to_id).toBe(group.id)
    })

  })

  describe('GET /api/admin/groups/[id] (subscribers in response)', () => {
    it('returns subscribers for the group', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}`, adminAuth)
      expect(response.subscribers).toBeDefined()
      expect(response.subscribers.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('GET /api/admin/subscribers/[id]/groups', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/subscribers/${subscriber.id}/groups`).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns groups for a subscriber', async () => {
      const response = await $fetch(`/api/admin/subscribers/${subscriber.id}/groups`, adminAuth)
      expect(response.groups).toBeDefined()
      expect(response.groups.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('DELETE /api/admin/groups/[id]/subscribers', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/subscribers?subscriber_id=${subscriber.id}`, {
        method: 'DELETE'
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 400 when subscriber_id is missing', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/subscribers`, {
        method: 'DELETE',
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('removes a subscriber from a group', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}/subscribers?subscriber_id=${subscriber.id}`, {
        method: 'DELETE',
        ...adminAuth
      })

      expect(response.success).toBe(true)

      // Verify subscriber no longer appears in group
      const detail = await $fetch(`/api/admin/groups/${group.id}`, adminAuth)
      const subscriberIds = detail.subscribers.map((s: any) => s.subscriber_id)
      expect(subscriberIds).not.toContain(subscriber.id)
    })
  })
})
