import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  getTestUserInvitationByEmail
} from '../../../helpers/db'
import {
  createAdminUser,
  createEditorUser,
  createNoRoleUser
} from '../../../helpers/auth'

describe('POST /api/admin/users/invite', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let adminUserId: string

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql, { display_name: 'Test Admin' })
    adminAuth = admin.auth
    adminUserId = admin.user.id

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth
  })

  afterEach(async () => {
    // Clean up invitations created during tests
    await sql`DELETE FROM user_invitations WHERE email LIKE 'test-%@example.com'`
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email: 'test-new@example.com' }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for non-admin users (people_group_editor)', async () => {
      // This test exposes the bug: invite.post.ts uses requireAuth() instead of requireAdmin()
      const error = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email: 'test-new@example.com' },
        ...editorAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email: 'test-new@example.com' },
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('succeeds for admin users', async () => {
      const email = `test-invite-success-${Date.now()}@example.com`
      const response = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.invitation).toBeDefined()
      expect(response.invitation.email).toBe(email)
    })
  })

  describe('Validation', () => {
    it('returns 400 for missing email', async () => {
      const error = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: {},
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toContain('Email is required')
    })

    it('returns 400 for invalid email format', async () => {
      const error = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email: 'not-an-email' },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toContain('Invalid email')
    })

    it('returns 400 for existing user email', async () => {
      // Create a user first
      const { user } = await createNoRoleUser(sql, { email: `test-existing-${Date.now()}@example.com` })

      const error = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email: user.email },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toContain('already exists')
    })

    it('returns 400 for pending invitation exists', async () => {
      const email = `test-pending-${Date.now()}@example.com`

      // Create first invitation
      await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email },
        ...adminAuth
      })

      // Try to create another invitation for the same email
      const error = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
      expect(error.statusMessage).toContain('pending invitation')
    })
  })

  describe('Successful invitation', () => {
    it('creates invitation with default role (null)', async () => {
      const email = `test-default-role-${Date.now()}@example.com`
      const response = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.invitation.email).toBe(email)
      expect(response.invitation.token).toBeDefined()
      expect(response.invitation.status).toBe('pending')

      // Verify in database
      const invitation = await getTestUserInvitationByEmail(sql, email)
      expect(invitation).toBeDefined()
      expect(invitation?.roles).toEqual([])
    })

    it('creates invitation with specified roles', async () => {
      const email = `test-admin-role-${Date.now()}@example.com`
      const response = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email, roles: ['admin'] },
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const invitation = await getTestUserInvitationByEmail(sql, email)
      expect(invitation?.roles).toContain('admin')
    })

    it('creates invitation with people_group_editor role', async () => {
      const email = `test-editor-role-${Date.now()}@example.com`
      const response = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email, roles: ['people_group_editor'] },
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const invitation = await getTestUserInvitationByEmail(sql, email)
      expect(invitation?.roles).toContain('people_group_editor')
    })

    it('creates invitation with custom expiry', async () => {
      const email = `test-expiry-${Date.now()}@example.com`
      const response = await $fetch('/api/admin/users/invite', {
        method: 'POST',
        body: { email, expires_in_days: 14 },
        ...adminAuth
      })

      expect(response.success).toBe(true)

      const invitation = await getTestUserInvitationByEmail(sql, email)
      expect(invitation).toBeDefined()

      // Verify expiry is approximately 14 days from now
      const expiresAt = new Date(invitation!.expires_at)
      const now = new Date()
      const daysDiff = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBeGreaterThanOrEqual(13)
      expect(daysDiff).toBeLessThanOrEqual(14)
    })
  })
})
