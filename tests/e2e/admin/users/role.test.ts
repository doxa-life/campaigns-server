import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  getTestUser
} from '../../../helpers/db'
import {
  createAdminUser,
  createEditorUser,
  createNoRoleUser
} from '../../../helpers/auth'

describe('PUT /api/admin/users/[id]/role', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let targetUserId: string

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth

    // Create a target user whose roles we'll modify
    const target = await createNoRoleUser(sql)
    targetUserId = target.user.id
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PUT',
        body: { roles: ['admin'] }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for non-admin users', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PUT',
        body: { roles: ['admin'] },
        ...editorAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('succeeds for admin users', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PUT',
        body: { roles: ['people_group_editor'] },
        ...adminAuth
      })

      expect(response.success).toBe(true)
    })
  })

  describe('Role updates', () => {
    it('can set roles to admin', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PUT',
        body: { roles: ['admin'] },
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const user = await getTestUser(sql, targetUserId)
      expect(user?.roles).toContain('admin')
    })

    it('can set roles to people_group_editor', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PUT',
        body: { roles: ['people_group_editor'] },
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const user = await getTestUser(sql, targetUserId)
      expect(user?.roles).toContain('people_group_editor')
    })

    it('can assign multiple roles', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PUT',
        body: { roles: ['progress_admin', 'content_editor'] },
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const user = await getTestUser(sql, targetUserId)
      expect(user?.roles).toContain('progress_admin')
      expect(user?.roles).toContain('content_editor')
    })

    it('can remove all roles (set to empty array)', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PUT',
        body: { roles: [] },
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const user = await getTestUser(sql, targetUserId)
      expect(user?.roles).toEqual([])
    })
  })

  describe('Validation', () => {
    it('returns 400 for invalid user ID', async () => {
      const error = await $fetch('/api/admin/users/invalid-id/role', {
        method: 'PUT',
        body: { roles: ['admin'] },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })

    it('returns 404 for non-existent user', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000'
      const error = await $fetch(`/api/admin/users/${fakeUuid}/role`, {
        method: 'PUT',
        body: { roles: ['admin'] },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(404)
    })
  })
})
