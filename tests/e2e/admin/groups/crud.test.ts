import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber,
  createTestContactMethod,
} from '../../../helpers/db'
import {
  createAdminUser,
  createNoRoleUser,
  createEditorUser,
} from '../../../helpers/auth'

describe('Group CRUD API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('POST /api/admin/groups', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group Unauth' }
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group NoRole' },
        ...noRoleAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 403 for editor users', async () => {
      const error = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group Editor' },
        ...editorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 400 when name is missing', async () => {
      const error = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: '' },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('creates a group successfully', async () => {
      const response = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group Created' },
        ...adminAuth
      })

      expect(response.group).toBeDefined()
      expect(response.group.name).toBe('Test Group Created')
      expect(response.group.id).toBeDefined()
    })

    it('creates a group with primary_subscriber_id', async () => {
      const subscriber = await createTestSubscriber(sql, { name: 'Test Primary Contact' })
      await createTestContactMethod(sql, subscriber.id, {
        value: `test-primary-${Date.now()}@example.com`,
        verified: true
      })

      const response = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group With Primary', primary_subscriber_id: subscriber.id },
        ...adminAuth
      })

      expect(response.group.primary_subscriber_id).toBe(subscriber.id)
    })
  })

  describe('GET /api/admin/groups', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/groups').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/groups', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns groups list for admin', async () => {
      const response = await $fetch('/api/admin/groups', adminAuth)
      expect(response.groups).toBeDefined()
      expect(Array.isArray(response.groups)).toBe(true)
      expect(response.total).toBeDefined()
    })

    it('supports search', async () => {
      await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group Searchable Unique' },
        ...adminAuth
      })

      const response = await $fetch('/api/admin/groups?search=Searchable%20Unique', adminAuth)
      expect(response.groups.length).toBeGreaterThanOrEqual(1)
      expect(response.groups[0].name).toContain('Searchable Unique')
    })

    it('supports pagination', async () => {
      const response = await $fetch('/api/admin/groups?limit=1&offset=0', adminAuth)
      expect(response.groups.length).toBeLessThanOrEqual(1)
    })
  })

  describe('GET /api/admin/groups/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/groups/1').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent group', async () => {
      const error = await $fetch('/api/admin/groups/999999', adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('returns group with subscribers and adoptions', async () => {
      const created = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group Detail' },
        ...adminAuth
      })

      const response = await $fetch(`/api/admin/groups/${created.group.id}`, adminAuth)
      expect(response.group).toBeDefined()
      expect(response.group.name).toBe('Test Group Detail')
      expect(response.subscribers).toBeDefined()
      expect(Array.isArray(response.subscribers)).toBe(true)
      expect(response.adoptions).toBeDefined()
      expect(Array.isArray(response.adoptions)).toBe(true)
    })
  })

  describe('PUT /api/admin/groups/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/groups/1', {
        method: 'PUT',
        body: { name: 'Test Updated' }
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent group', async () => {
      const error = await $fetch('/api/admin/groups/999999', {
        method: 'PUT',
        body: { name: 'Test Updated' },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('updates group name', async () => {
      const created = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group Before Update' },
        ...adminAuth
      })

      const response = await $fetch(`/api/admin/groups/${created.group.id}`, {
        method: 'PUT',
        body: { name: 'Test Group After Update' },
        ...adminAuth
      })

      expect(response.group.name).toBe('Test Group After Update')
    })

    it('updates group country', async () => {
      const created = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group Country' },
        ...adminAuth
      })

      const response = await $fetch(`/api/admin/groups/${created.group.id}`, {
        method: 'PUT',
        body: { country: 'US' },
        ...adminAuth
      })

      expect(response.group.country).toBe('US')
    })
  })

  describe('DELETE /api/admin/groups/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/groups/1', {
        method: 'DELETE'
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent group', async () => {
      const error = await $fetch('/api/admin/groups/999999', {
        method: 'DELETE',
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('deletes a group', async () => {
      const created = await $fetch('/api/admin/groups', {
        method: 'POST',
        body: { name: 'Test Group To Delete' },
        ...adminAuth
      })

      const response = await $fetch(`/api/admin/groups/${created.group.id}`, {
        method: 'DELETE',
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const error = await $fetch(`/api/admin/groups/${created.group.id}`, adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })
  })
})
