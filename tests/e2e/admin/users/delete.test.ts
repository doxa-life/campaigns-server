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
  createNoRoleUser,
  createAndLoginUser
} from '../../../helpers/auth'

describe('DELETE /api/admin/users/[id]', async () => {
  const sql = getTestDatabase()

  let adminId: string
  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminId = admin.user.id
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const target = await createNoRoleUser(sql)
      const error = await $fetch(`/api/admin/users/${target.user.id}`, {
        method: 'DELETE'
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users without users.manage permission', async () => {
      const target = await createNoRoleUser(sql)
      const error = await $fetch(`/api/admin/users/${target.user.id}`, {
        method: 'DELETE',
        ...editorAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })
  })

  describe('Safety rules', () => {
    it('returns 400 when deleting your own account', async () => {
      const error = await $fetch(`/api/admin/users/${adminId}`, {
        method: 'DELETE',
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })

    it('returns 403 when deleting a superadmin', async () => {
      const superadmin = await createAndLoginUser(sql, null, { superadmin: true })
      const error = await $fetch(`/api/admin/users/${superadmin.user.id}`, {
        method: 'DELETE',
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('returns 404 for a non-existent user', async () => {
      const error = await $fetch('/api/admin/users/00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(404)
    })
  })

  describe('Deletion', () => {
    it('deletes the user', async () => {
      const target = await createNoRoleUser(sql)
      const response = await $fetch(`/api/admin/users/${target.user.id}`, {
        method: 'DELETE',
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const rows = await sql`SELECT id FROM users WHERE id = ${target.user.id}`
      expect(rows.length).toBe(0)
    })

    it('removes invitations the user sent', async () => {
      const target = await createAdminUser(sql)
      await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email: `test-${Date.now()}@example.com`, roles: [] },
        ...target.auth
      })

      const response = await $fetch(`/api/admin/users/${target.user.id}`, {
        method: 'DELETE',
        ...adminAuth
      })
      expect(response.success).toBe(true)

      const invitations = await sql`SELECT id FROM user_invitations WHERE invited_by = ${target.user.id}`
      expect(invitations.length).toBe(0)
    })
  })
})
