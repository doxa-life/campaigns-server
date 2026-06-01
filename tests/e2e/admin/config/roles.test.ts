import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData
} from '../../../helpers/db'
import {
  createAdminUser,
  createEditorUser,
  createNoRoleUser
} from '../../../helpers/auth'

describe('GET /api/admin/roles', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/roles').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/roles', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 403 for people_group_editor users', async () => {
      const error = await $fetch('/api/admin/roles', editorAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('succeeds for admin users', async () => {
      const response = await $fetch('/api/admin/roles', adminAuth)
      expect(response.roles).toBeDefined()
    })
  })

  describe('Response structure', () => {
    it('returns roles array', async () => {
      const response = await $fetch('/api/admin/roles', adminAuth)

      expect(response.roles).toBeDefined()
      expect(Array.isArray(response.roles)).toBe(true)
    })

    it('includes admin and people_group_editor roles', async () => {
      const response = await $fetch('/api/admin/roles', adminAuth)

      const roleNames = response.roles.map((r: any) => r.name)
      expect(roleNames).toContain('admin')
      expect(roleNames).toContain('people_group_editor')
    })

    it('roles have expected fields', async () => {
      const response = await $fetch('/api/admin/roles', adminAuth)

      const adminRole = response.roles.find((r: any) => r.name === 'admin')
      expect(adminRole).toHaveProperty('name')
      expect(adminRole).toHaveProperty('description')
      expect(adminRole).toHaveProperty('permissions')
    })

    it('admin role has full permissions', async () => {
      const response = await $fetch('/api/admin/roles', adminAuth)

      const adminRole = response.roles.find((r: any) => r.name === 'admin')
      expect(adminRole.permissions).toContain('users.manage')
    })

    it('people_group_editor role does not have user management permissions', async () => {
      const response = await $fetch('/api/admin/roles', adminAuth)

      const editorRole = response.roles.find((r: any) => r.name === 'people_group_editor')
      expect(editorRole.permissions).not.toContain('users.manage')
    })
  })
})
