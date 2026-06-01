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

describe('Marketing Emails API', async () => {
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

  describe('GET /api/admin/marketing/emails', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/marketing/emails').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/marketing/emails', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('succeeds for admin users', async () => {
      const response = await $fetch('/api/admin/marketing/emails', adminAuth)
      expect(response.emails).toBeDefined()
      expect(Array.isArray(response.emails)).toBe(true)
    })

    it('succeeds for people_group_editor users', async () => {
      const response = await $fetch('/api/admin/marketing/emails', editorAuth)
      expect(response.emails).toBeDefined()
    })
  })

  describe('POST /api/admin/marketing/emails', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: { subject: 'Test Email', body: 'Test content' }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: { subject: 'Test Email', body: 'Test content' },
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('creates marketing email draft', async () => {
      const response = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: {
          subject: 'Test Marketing Email',
          content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test content' }] }] },
          audience_type: 'doxa'
        },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.email).toBeDefined()
      expect(response.email.subject).toBe('Test Marketing Email')
    })

    it('validates required fields', async () => {
      const error = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: {},
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })
  })

  describe('GET /api/admin/marketing/audience/doxa', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/marketing/audience/doxa').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for non-superadmin users', async () => {
      const error = await $fetch('/api/admin/marketing/audience/doxa', adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })
})
