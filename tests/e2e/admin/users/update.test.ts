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

describe('PUT /api/admin/users/[id]', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let targetUserId: string
  let otherUserEmail: string

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth
    otherUserEmail = editor.user.email

    const target = await createNoRoleUser(sql)
    targetUserId = target.user.id
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { display_name: 'New Name' }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users without users.manage permission', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { display_name: 'New Name' },
        ...editorAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })
  })

  describe('Validation', () => {
    it('returns 400 when no editable field is provided', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: {},
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })

    it('returns 400 for an invalid email format', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { email: 'not-an-email' },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })

    it('returns 400 when email is already taken by another user', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { email: otherUserEmail },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })

    it('returns 400 for non-boolean verified', async () => {
      const error = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { verified: 'yes' },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })

    it('returns 404 for a non-existent user', async () => {
      const error = await $fetch('/api/admin/users/00000000-0000-0000-0000-000000000000', {
        method: 'PUT',
        body: { display_name: 'Ghost' },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(404)
    })
  })

  describe('Updates', () => {
    it('updates display_name', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { display_name: 'Updated Name' },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.user.display_name).toBe('Updated Name')

      const [row] = await sql`SELECT display_name FROM users WHERE id = ${targetUserId}`
      expect(row.display_name).toBe('Updated Name')
    })

    it('updates email', async () => {
      const newEmail = 'test-updated-target@example.com'
      const response = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { email: newEmail },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.user.email).toBe(newEmail)

      const [row] = await sql`SELECT email FROM users WHERE id = ${targetUserId}`
      expect(row.email).toBe(newEmail)
    })

    it('allows re-saving a user with their own unchanged email', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { email: 'test-updated-target@example.com', display_name: 'Same Email Save' },
        ...adminAuth
      })

      expect(response.success).toBe(true)
    })

    it('updates verified status', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { verified: false },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.user.verified).toBe(false)

      const [row] = await sql`SELECT verified FROM users WHERE id = ${targetUserId}`
      expect(row.verified).toBe(false)
    })

    it('updates multiple fields at once', async () => {
      const response = await $fetch(`/api/admin/users/${targetUserId}`, {
        method: 'PUT',
        body: { display_name: 'Multi Update', verified: true },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.user.display_name).toBe('Multi Update')
      expect(response.user.verified).toBe(true)
    })
  })
})
