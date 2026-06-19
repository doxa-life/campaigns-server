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
  createProgressAdminUser
} from '../../../helpers/auth'

describe('Marketing Emails API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let progressAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth

    const progress = await createProgressAdminUser(sql)
    progressAuth = progress.auth
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

    it('returns 403 for people_group_editor users (marketing is admin-only)', async () => {
      const error = await $fetch('/api/admin/marketing/emails', editorAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
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

    it('creates a draft for the active_pg audience', async () => {
      const response = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: {
          subject: 'Active Subscribers Email',
          content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
          audience_type: 'active_pg'
        },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.email.audience_type).toBe('active_pg')
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

  // Progress Admin may email contacts who gave marketing (Doxa-general) consent, but is
  // walled off from the all-subscriber and hand-picked audiences, which stay admin-only.
  describe('POST /api/admin/marketing/emails — progress_admin audience boundaries', () => {
    const content_json = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }

    it('lists marketing emails (has marketing.view)', async () => {
      const response = await $fetch('/api/admin/marketing/emails', progressAuth)
      expect(Array.isArray(response.emails)).toBe(true)
    })

    it('can create a doxa (marketing consent) draft', async () => {
      const response = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: { subject: 'PA Doxa', content_json, audience_type: 'doxa' },
        ...progressAuth
      })
      expect(response.success).toBe(true)
      expect(response.email.audience_type).toBe('doxa')
    })

    it('can create a doxa_active_pg draft', async () => {
      const response = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: { subject: 'PA Doxa Active', content_json, audience_type: 'doxa_active_pg' },
        ...progressAuth
      })
      expect(response.success).toBe(true)
      expect(response.email.audience_type).toBe('doxa_active_pg')
    })

    it('cannot create an active_pg (All Active Subscribers) draft', async () => {
      const error = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: { subject: 'PA Active', content_json, audience_type: 'active_pg' },
        ...progressAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('cannot create a pick (hand-picked contacts) draft', async () => {
      const error = await $fetch('/api/admin/marketing/emails', {
        method: 'POST',
        body: { subject: 'PA Pick', content_json, audience_type: 'pick', recipient_contact_method_ids: [] },
        ...progressAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('GET /api/admin/marketing/audience/doxa', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/marketing/audience/doxa').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/marketing/audience/doxa', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns a count for admin users', async () => {
      const response = await $fetch('/api/admin/marketing/audience/doxa', adminAuth)
      expect(response.audience_type).toBe('doxa')
    })
  })

  describe('GET /api/admin/marketing/audience/active-pg', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/marketing/audience/active-pg').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/marketing/audience/active-pg', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns a count for admin users', async () => {
      const response = await $fetch('/api/admin/marketing/audience/active-pg', adminAuth)
      expect(response.audience_type).toBe('active_pg')
      expect(typeof response.count).toBe('number')
    })
  })
})
