import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestLibrary,
  createTestLibraryContent,
  getTestLibraryContent
} from '../../../../helpers/db'
import {
  createAdminUser,
  createEditorUser,
  createNoRoleUser
} from '../../../../helpers/auth'

describe('Library Content CRUD API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let testLibrary: { id: number; name: string }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth
  })

  beforeEach(async () => {
    testLibrary = await createTestLibrary(sql, { name: `Test Library Content ${Date.now()}` })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('GET /api/admin/libraries/[libraryId]/content', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content`).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('succeeds for authenticated users', async () => {
      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content`, adminAuth)
      expect(response.content).toBeDefined()
    })

    it('returns content array', async () => {
      // Create some test content
      await createTestLibraryContent(sql, testLibrary.id, { day_number: 1 })
      await createTestLibraryContent(sql, testLibrary.id, { day_number: 2 })

      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content`, adminAuth)

      expect(Array.isArray(response.content)).toBe(true)
      expect(response.content.length).toBeGreaterThanOrEqual(2)
    })

    it('returns empty array for non-existent library', async () => {
      const response = await $fetch('/api/admin/libraries/999999/content', adminAuth)
      expect(Array.isArray(response.content)).toBe(true)
      expect(response.content.length).toBe(0)
    })
  })

  describe('GET /api/admin/libraries/[libraryId]/content/[id]', () => {
    let testContent: { id: number }

    beforeEach(async () => {
      testContent = await createTestLibraryContent(sql, testLibrary.id, { day_number: 1 })
    })

    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${testContent.id}`).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns content with expected fields', async () => {
      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${testContent.id}`, adminAuth)

      expect(response.content).toHaveProperty('id')
      expect(response.content).toHaveProperty('day_number')
      expect(response.content).toHaveProperty('language_code')
      expect(response.content).toHaveProperty('content_json')
    })

    it('returns 404 for non-existent content', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/999999`, adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('POST /api/admin/libraries/[libraryId]/content', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content`, {
        method: 'POST',
        body: { day_number: 1, language_code: 'en', content_json: {} }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content`, {
        method: 'POST',
        body: { day_number: 1, language_code: 'en', content_json: {} },
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('creates content successfully', async () => {
      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content`, {
        method: 'POST',
        body: {
          day_number: 5,
          language_code: 'en',
          content_json: { type: 'doc', content: [] }
        },
        ...adminAuth
      })

      expect(response.success).toBe(true)
      expect(response.content).toBeDefined()
      expect(response.content.day_number).toBe(5)
    })

    it('validates required fields', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content`, {
        method: 'POST',
        body: {},
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(400)
    })
  })

  describe('PUT /api/admin/libraries/[libraryId]/content/[id]', () => {
    let testContent: { id: number }

    beforeEach(async () => {
      testContent = await createTestLibraryContent(sql, testLibrary.id, { day_number: 1 })
    })

    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${testContent.id}`, {
        method: 'PUT',
        body: { day_number: 2 }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${testContent.id}`, {
        method: 'PUT',
        body: { day_number: 2 },
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('updates content successfully', async () => {
      const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }] }

      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${testContent.id}`, {
        method: 'PUT',
        body: { content_json: newContent },
        ...adminAuth
      })

      expect(response.success).toBe(true)
    })

    it('returns 404 for non-existent content', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/999999`, {
        method: 'PUT',
        body: { day_number: 2 },
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/admin/libraries/[libraryId]/content/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const content = await createTestLibraryContent(sql, testLibrary.id, { day_number: 10 })

      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${content.id}`, {
        method: 'DELETE'
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const content = await createTestLibraryContent(sql, testLibrary.id, { day_number: 11 })

      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${content.id}`, {
        method: 'DELETE',
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })

    it('deletes content successfully', async () => {
      const content = await createTestLibraryContent(sql, testLibrary.id, { day_number: 12 })

      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/${content.id}`, {
        method: 'DELETE',
        ...adminAuth
      })

      expect(response.success).toBe(true)

      // Verify deletion
      const deleted = await getTestLibraryContent(sql, content.id)
      expect(deleted).toBeNull()
    })

    it('returns 404 for non-existent content', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/999999`, {
        method: 'DELETE',
        ...adminAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(404)
    })
  })

  describe('GET /api/admin/libraries/[libraryId]/content/day/[dayNumber]', () => {
    beforeEach(async () => {
      await createTestLibraryContent(sql, testLibrary.id, { day_number: 1, language_code: 'en' })
      await createTestLibraryContent(sql, testLibrary.id, { day_number: 1, language_code: 'es' })
    })

    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/day/1`).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns content for specific day', async () => {
      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/day/1`, adminAuth)

      expect(response.content).toBeDefined()
      expect(Array.isArray(response.content)).toBe(true)
    })

    it('returns empty array for day with no content', async () => {
      const response = await $fetch(`/api/admin/libraries/${testLibrary.id}/content/day/999`, adminAuth)

      expect(response.content).toBeDefined()
      expect(response.content).toHaveLength(0)
    })
  })
})
