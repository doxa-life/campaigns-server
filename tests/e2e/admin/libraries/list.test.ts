import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestLibrary
} from '../../../helpers/db'
import {
  createAdminUser,
  createEditorUser,
  createNoRoleUser
} from '../../../helpers/auth'

describe('GET /api/admin/libraries', async () => {
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

    // Create test libraries
    await createTestLibrary(sql, { name: 'Test Library Alpha' })
    await createTestLibrary(sql, { name: 'Test Library Beta' })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/libraries').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/libraries', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('succeeds for admin users', async () => {
      const response = await $fetch('/api/admin/libraries', adminAuth)
      expect(response.libraries).toBeDefined()
    })

    it('succeeds for people_group_editor users', async () => {
      const response = await $fetch('/api/admin/libraries', editorAuth)
      expect(response.libraries).toBeDefined()
    })
  })

  describe('Response structure', () => {
    it('returns libraries array with count', async () => {
      const response = await $fetch('/api/admin/libraries', adminAuth)

      expect(response.libraries).toBeDefined()
      expect(Array.isArray(response.libraries)).toBe(true)
      expect(response.count).toBeDefined()
      expect(typeof response.count).toBe('number')
    })

    it('libraries have expected fields', async () => {
      const response = await $fetch('/api/admin/libraries', adminAuth)

      // Find a test library
      const testLib = response.libraries.find((l: any) => l.name.startsWith('Test Library'))
      expect(testLib).toBeDefined()
      expect(testLib).toHaveProperty('id')
      expect(testLib).toHaveProperty('name')
      expect(testLib).toHaveProperty('description')
      expect(testLib).toHaveProperty('type')
      expect(testLib).toHaveProperty('stats')
    })

    it('libraries include stats', async () => {
      const response = await $fetch('/api/admin/libraries', adminAuth)

      const testLib = response.libraries.find((l: any) => l.name.startsWith('Test Library'))
      expect(testLib.stats).toBeDefined()
      expect(testLib.stats).toHaveProperty('totalDays')
    })
  })

  describe('Search filtering', () => {
    it('filters libraries by search term', async () => {
      const response = await $fetch('/api/admin/libraries?search=Alpha', adminAuth)

      expect(response.libraries.some((l: any) => l.name.includes('Alpha'))).toBe(true)
    })
  })

  describe('Virtual libraries', () => {
    it('does not include virtual libraries by default', async () => {
      const response = await $fetch('/api/admin/libraries', adminAuth)

      // Virtual libraries have negative IDs
      expect(response.libraries.every((l: any) => l.id > 0)).toBe(true)
    })

    it('includes virtual libraries when requested', async () => {
      const response = await $fetch('/api/admin/libraries?includeVirtual=true', adminAuth)

      // Should include People Group library (id: -1)
      const virtualLib = response.libraries.find((l: any) => l.id === -1)
      expect(virtualLib).toBeDefined()
      expect(virtualLib.name).toBe('People Group')
    })
  })
})
