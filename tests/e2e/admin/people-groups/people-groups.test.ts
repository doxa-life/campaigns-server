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

describe('People Groups API', async () => {
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

  describe('GET /api/admin/people-groups', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('succeeds for authenticated users', async () => {
      const response = await $fetch('/api/admin/people-groups', adminAuth)
      expect(response.peopleGroups).toBeDefined()
      expect(Array.isArray(response.peopleGroups)).toBe(true)
    })

    it('returns 403 for people_group_editor users (admin only)', async () => {
      const error = await $fetch('/api/admin/people-groups', editorAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 403 for users with no role (admin only)', async () => {
      const error = await $fetch('/api/admin/people-groups', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('GET /api/admin/people-groups/field-options', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups/field-options').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns field options with categories and fields for authenticated users', async () => {
      const response = await $fetch('/api/admin/people-groups/field-options', adminAuth)
      expect(response).toBeDefined()
      expect(response.categories).toBeDefined()
      expect(response.fields).toBeDefined()
      expect(response.fieldsByCategory).toBeDefined()
      expect(Array.isArray(response.categories)).toBe(true)
      expect(Array.isArray(response.fields)).toBe(true)
    })

    it('returns options for a specific field', async () => {
      const response = await $fetch('/api/admin/people-groups/field-options?field=imb_region', adminAuth)
      expect(response).toBeDefined()
      expect(response.options).toBeDefined()
      expect(Array.isArray(response.options)).toBe(true)
    })

    it('indicates optionsSource for dynamic fields', async () => {
      const response = await $fetch('/api/admin/people-groups/field-options?field=country_code', adminAuth)
      expect(response).toBeDefined()
      expect(response.optionsSource).toBe('countries')
    })
  })

  describe('GET /api/admin/people-groups/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups/1').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent people group', async () => {
      const error = await $fetch('/api/admin/people-groups/999999', adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('PUT /api/admin/people-groups/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups/1', {
        method: 'PUT',
        body: { name: 'Updated Name' }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/people-groups/1', {
        method: 'PUT',
        body: { name: 'Updated Name' },
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })
  })

})
