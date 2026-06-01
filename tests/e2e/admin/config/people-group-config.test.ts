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

describe('People Group Config API', async () => {
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

  describe('GET /api/admin/people-group-config/libraries', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-group-config/libraries').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/people-group-config/libraries', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('succeeds for admin users', async () => {
      const response = await $fetch('/api/admin/people-group-config/libraries', adminAuth)
      expect(response).toBeDefined()
    })

    it('succeeds for people_group_editor users (content.edit permission)', async () => {
      const response = await $fetch('/api/admin/people-group-config/libraries', editorAuth)
      expect(response).toBeDefined()
    })
  })

  describe('PUT /api/admin/people-group-config/libraries', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-group-config/libraries', {
        method: 'PUT',
        body: { config: {} }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/people-group-config/libraries', {
        method: 'PUT',
        body: { config: {} },
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('succeeds for admin users', async () => {
      // Send valid config format
      const response = await $fetch('/api/admin/people-group-config/libraries', {
        method: 'PUT',
        body: {
          rows: [],
          global_start_date: '2025-01-01'
        },
        ...adminAuth
      })

      expect(response.config).toBeDefined()
    })
  })
})
