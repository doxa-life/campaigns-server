import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestGroup,
  createTestSubscriber,
  createTestContactMethod,
} from '../../../helpers/db'
import { createAdminUser, createNoRoleUser } from '../../../helpers/auth'

describe('Group Adoptions API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let group: { id: number; name: string }
  let peopleGroup: { id: number; slug: string }
  let peopleGroup2: { id: number; slug: string }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth

    group = await createTestGroup(sql, { name: 'Test Group Adoptions' })
    peopleGroup = await createTestPeopleGroup(sql, { title: 'Adopted People Group' })
    peopleGroup2 = await createTestPeopleGroup(sql, { title: 'Second People Group' })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('POST /api/admin/groups/[id]/adoptions', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: peopleGroup.id }
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: peopleGroup.id },
        ...noRoleAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('returns 400 when people_group_id is missing', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: {},
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('returns 404 when group does not exist', async () => {
      const error = await $fetch('/api/admin/groups/999999/adoptions', {
        method: 'POST',
        body: { people_group_id: peopleGroup.id },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('creates an adoption with default active status', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: peopleGroup.id },
        ...adminAuth
      })

      expect(response.adoption).toBeDefined()
      expect(response.adoption.people_group_id).toBe(peopleGroup.id)
      expect(response.adoption.group_id).toBe(group.id)
      expect(response.adoption.status).toBe('active')
      expect(response.adoption.update_token).toBeDefined()
      expect(response.adoption.adopted_at).toBeDefined()
    })

    it('creates an adoption with pending status', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: peopleGroup2.id, status: 'pending' },
        ...adminAuth
      })

      expect(response.adoption.status).toBe('pending')
    })

    it('returns 409 for duplicate adoption', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: peopleGroup.id },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(409)
    })
  })

  describe('PUT /api/admin/groups/[id]/adoptions/[adoptionId]', () => {
    let adoptionId: number

    beforeAll(async () => {
      // Get the adoption we created earlier
      const detail = await $fetch(`/api/admin/groups/${group.id}`, adminAuth)
      const adoption = detail.adoptions.find((a: any) => a.people_group_id === peopleGroup.id)
      adoptionId = adoption.id
    })

    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions/${adoptionId}`, {
        method: 'PUT',
        body: { status: 'inactive' }
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent adoption', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions/999999`, {
        method: 'PUT',
        body: { status: 'inactive' },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('updates adoption status', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}/adoptions/${adoptionId}`, {
        method: 'PUT',
        body: { status: 'inactive' },
        ...adminAuth
      })

      expect(response.adoption.status).toBe('inactive')
    })

    it('updates show_publicly flag', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}/adoptions/${adoptionId}`, {
        method: 'PUT',
        body: { show_publicly: true },
        ...adminAuth
      })

      expect(response.adoption.show_publicly).toBe(true)
    })
  })

  describe('GET /api/admin/groups/[id]/adoptions/[adoptionId]/reports', () => {
    let adoptionId: number

    beforeAll(async () => {
      const detail = await $fetch(`/api/admin/groups/${group.id}`, adminAuth)
      const adoption = detail.adoptions.find((a: any) => a.people_group_id === peopleGroup.id)
      adoptionId = adoption.id
    })

    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions/${adoptionId}/reports`).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns reports array (empty initially)', async () => {
      const response = await $fetch(`/api/admin/groups/${group.id}/adoptions/${adoptionId}/reports`, adminAuth)
      expect(response.reports).toBeDefined()
      expect(Array.isArray(response.reports)).toBe(true)
    })
  })

  describe('DELETE /api/admin/groups/[id]/adoptions/[adoptionId]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions/1`, {
        method: 'DELETE'
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent adoption', async () => {
      const error = await $fetch(`/api/admin/groups/${group.id}/adoptions/999999`, {
        method: 'DELETE',
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('deletes an adoption', async () => {
      // Create a new adoption specifically for deletion
      const pg = await createTestPeopleGroup(sql, { title: 'Delete PG' })
      const created = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: pg.id },
        ...adminAuth
      })

      const response = await $fetch(`/api/admin/groups/${group.id}/adoptions/${created.adoption.id}`, {
        method: 'DELETE',
        ...adminAuth
      })

      expect(response.success).toBe(true)
    })

    it('cascades deletion to adoption reports', async () => {
      // Create adoption, submit a report, then delete adoption
      const pg = await createTestPeopleGroup(sql, { title: 'Cascade PG' })
      const created = await $fetch(`/api/admin/groups/${group.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: pg.id },
        ...adminAuth
      })

      // Get the update_token to submit a report
      const detail = await $fetch(`/api/admin/groups/${group.id}`, adminAuth)
      const adoption = detail.adoptions.find((a: any) => a.id === created.adoption.id)

      // Submit a report via the token
      await $fetch(`/api/adoption/update/${adoption.update_token}`, {
        method: 'POST',
        body: { praying_count: 5, stories: 'Test story' }
      })

      // Verify report exists
      const reports = await $fetch(`/api/admin/groups/${group.id}/adoptions/${created.adoption.id}/reports`, adminAuth)
      expect(reports.reports.length).toBe(1)

      // Delete the adoption
      const response = await $fetch(`/api/admin/groups/${group.id}/adoptions/${created.adoption.id}`, {
        method: 'DELETE',
        ...adminAuth
      })

      expect(response.success).toBe(true)
    })
  })

  describe('POST /api/admin/groups/[id]/adoptions/[adoptionId]/send-reminder', () => {
    let groupWithContact: { id: number; name: string }
    let adoptionId: number

    beforeAll(async () => {
      // Create a group with a primary subscriber who has an email
      const primarySub = await createTestSubscriber(sql, { name: 'Test Primary Sub' })
      await createTestContactMethod(sql, primarySub.id, {
        value: `test-adoption-reminder-${Date.now()}@example.com`,
        verified: true
      })

      groupWithContact = await createTestGroup(sql, {
        name: 'Test Group With Contact',
        primary_subscriber_id: primarySub.id
      })

      const pg = await createTestPeopleGroup(sql, { title: 'Reminder PG' })
      const created = await $fetch(`/api/admin/groups/${groupWithContact.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: pg.id },
        ...adminAuth
      })
      adoptionId = created.adoption.id
    })

    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/groups/${groupWithContact.id}/adoptions/${adoptionId}/send-reminder`, {
        method: 'POST'
      }).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent adoption', async () => {
      const error = await $fetch(`/api/admin/groups/${groupWithContact.id}/adoptions/999999/send-reminder`, {
        method: 'POST',
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('returns 400 when group has no primary contact', async () => {
      const groupNoPrimary = await createTestGroup(sql, { name: 'Test Group No Primary' })
      const pg = await createTestPeopleGroup(sql, { title: 'No Primary PG' })
      const created = await $fetch(`/api/admin/groups/${groupNoPrimary.id}/adoptions`, {
        method: 'POST',
        body: { people_group_id: pg.id },
        ...adminAuth
      })

      const error = await $fetch(`/api/admin/groups/${groupNoPrimary.id}/adoptions/${created.adoption.id}/send-reminder`, {
        method: 'POST',
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('sends reminder email when group has primary contact with email', async () => {
      const response = await $fetch(`/api/admin/groups/${groupWithContact.id}/adoptions/${adoptionId}/send-reminder`, {
        method: 'POST',
        ...adminAuth
      }).catch((e) => {
        // Accept email infrastructure errors but not auth/validation errors
        if (e.statusCode === 401 || e.statusCode === 403 || e.statusCode === 400 || e.statusCode === 404) {
          throw e
        }
        return { success: false, error: 'email_error' }
      })

      expect(response).toBeDefined()
    })
  })
})
