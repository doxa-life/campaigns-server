import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestGroup,
  createTestAdoption,
} from '../helpers/db'

describe('Adoption Update (Token-based) API', async () => {
  const sql = getTestDatabase()

  let adoption: { id: number; update_token: string; status: string }
  let peopleGroup: { id: number; slug: string; title: string }
  let group: { id: number; name: string }

  beforeAll(async () => {
    await cleanupTestData(sql)

    group = await createTestGroup(sql, { name: 'Test Token Group' })
    peopleGroup = await createTestPeopleGroup(sql, { title: 'Token PG' })
    adoption = await createTestAdoption(sql, group.id, peopleGroup.id, { status: 'active' })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('GET /api/adoption/update/[token]', () => {
    it('returns adoption details for a valid token', async () => {
      const response = await $fetch(`/api/adoption/update/${adoption.update_token}`)

      expect(response.adoption).toBeDefined()
      expect(response.adoption.id).toBe(adoption.id)
      expect(response.adoption.group_name).toBe('Test Token Group')
      expect(response.adoption.status).toBe('active')
      expect(response.adoption.adopted_at).toBeDefined()
    })

    it('returns 404 for invalid token', async () => {
      const error = await $fetch('/api/adoption/update/00000000-0000-0000-0000-000000000000').catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('does not require authentication', async () => {
      // Should succeed without any auth headers
      const response = await $fetch(`/api/adoption/update/${adoption.update_token}`)
      expect(response.adoption).toBeDefined()
    })
  })

  describe('POST /api/adoption/update/[token]', () => {
    it('submits an adoption report', async () => {
      const response = await $fetch(`/api/adoption/update/${adoption.update_token}`, {
        method: 'POST',
        body: {
          praying_count: 10,
          stories: 'God has been moving among this people group.',
          comments: 'We need more resources.'
        }
      })

      expect(response.report).toBeDefined()
      expect(response.report.adoption_id).toBe(adoption.id)
      expect(response.report.praying_count).toBe(10)
      expect(response.report.stories).toBe('God has been moving among this people group.')
      expect(response.report.comments).toBe('We need more resources.')
      expect(response.report.status).toBe('submitted')
    })

    it('submits a report with minimal data', async () => {
      const response = await $fetch(`/api/adoption/update/${adoption.update_token}`, {
        method: 'POST',
        body: {}
      })

      expect(response.report).toBeDefined()
      expect(response.report.praying_count).toBeNull()
      expect(response.report.stories).toBeNull()
      expect(response.report.comments).toBeNull()
      expect(response.report.status).toBe('submitted')
    })

    it('trims whitespace from text fields', async () => {
      const response = await $fetch(`/api/adoption/update/${adoption.update_token}`, {
        method: 'POST',
        body: {
          stories: '  Test story with spaces  ',
          comments: '  Test comment  '
        }
      })

      expect(response.report.stories).toBe('Test story with spaces')
      expect(response.report.comments).toBe('Test comment')
    })

    it('converts empty strings to null', async () => {
      const response = await $fetch(`/api/adoption/update/${adoption.update_token}`, {
        method: 'POST',
        body: {
          stories: '   ',
          comments: ''
        }
      })

      expect(response.report.stories).toBeNull()
      expect(response.report.comments).toBeNull()
    })

    it('returns 404 for invalid token', async () => {
      const error = await $fetch('/api/adoption/update/00000000-0000-0000-0000-000000000000', {
        method: 'POST',
        body: { praying_count: 5 }
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('does not require authentication', async () => {
      const response = await $fetch(`/api/adoption/update/${adoption.update_token}`, {
        method: 'POST',
        body: { praying_count: 1 }
      })
      expect(response.report).toBeDefined()
    })
  })
})
