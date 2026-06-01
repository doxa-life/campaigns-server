import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestGroup,
  createTestAdoption,
  createTestAdoptionReport,
} from '../../../helpers/db'
import { createAdminUser, createNoRoleUser } from '../../../helpers/auth'

describe('Adoption Reports API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let report: { id: number; adoption_id: number; status: string }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth

    const group = await createTestGroup(sql, { name: 'Test Group Reports' })
    const peopleGroup = await createTestPeopleGroup(sql, { title: 'Report PG' })
    const adoption = await createTestAdoption(sql, group.id, peopleGroup.id)
    report = await createTestAdoptionReport(sql, adoption.id, {
      praying_count: 15,
      stories: 'Test prayer story',
      comments: 'Test comment'
    })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('PUT /api/admin/adoption-reports/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/adoption-reports/${report.id}`, {
        method: 'PUT',
        body: { status: 'approved' }
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch(`/api/admin/adoption-reports/${report.id}`, {
        method: 'PUT',
        body: { status: 'approved' },
        ...noRoleAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 400 when status is missing', async () => {
      const error = await $fetch(`/api/admin/adoption-reports/${report.id}`, {
        method: 'PUT',
        body: {},
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('returns 404 for non-existent report', async () => {
      const error = await $fetch('/api/admin/adoption-reports/999999', {
        method: 'PUT',
        body: { status: 'approved' },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('approves a report', async () => {
      const response = await $fetch(`/api/admin/adoption-reports/${report.id}`, {
        method: 'PUT',
        body: { status: 'approved' },
        ...adminAuth
      })

      expect(response.report).toBeDefined()
      expect(response.report.status).toBe('approved')
      expect(response.report.id).toBe(report.id)
    })

    it('rejects a report', async () => {
      const response = await $fetch(`/api/admin/adoption-reports/${report.id}`, {
        method: 'PUT',
        body: { status: 'rejected' },
        ...adminAuth
      })

      expect(response.report.status).toBe('rejected')
    })

    it('resets a report back to submitted', async () => {
      const response = await $fetch(`/api/admin/adoption-reports/${report.id}`, {
        method: 'PUT',
        body: { status: 'submitted' },
        ...adminAuth
      })

      expect(response.report.status).toBe('submitted')
    })
  })
})
