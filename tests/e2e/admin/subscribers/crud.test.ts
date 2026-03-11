import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestSubscriber,
  createTestContactMethod,
  createTestPeopleGroupSubscription,
  assignUserToPeopleGroup
} from '../../../helpers/db'
import {
  createAdminUser,
  createEditorUser,
  createNoRoleUser
} from '../../../helpers/auth'

describe('Subscription CRUD API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let editorUserId: string
  let noRoleAuth: { headers: { cookie: string } }
  let assignedPeopleGroup: { id: number; slug: string }
  let unassignedPeopleGroup: { id: number; slug: string }
  let assignedSubscription: { id: number }
  let unassignedSubscription: { id: number }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth
    editorUserId = editor.user.id

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth
  })

  beforeEach(async () => {
    // Create fresh data for each test
    assignedPeopleGroup = await createTestPeopleGroup(sql, { title: 'Assigned People Group' })
    unassignedPeopleGroup = await createTestPeopleGroup(sql, { title: 'Unassigned People Group' })

    await assignUserToPeopleGroup(sql, editorUserId, assignedPeopleGroup.id)

    // Create subscriber in assigned people group
    const subscriber1 = await createTestSubscriber(sql, { name: 'Test Assigned Subscriber' })
    await createTestContactMethod(sql, subscriber1.id, {
      value: `test-assigned-${Date.now()}@example.com`,
      verified: true
    })
    assignedSubscription = await createTestPeopleGroupSubscription(sql, assignedPeopleGroup.id, subscriber1.id)

    // Create subscriber in unassigned people group
    const subscriber2 = await createTestSubscriber(sql, { name: 'Test Unassigned Subscriber' })
    await createTestContactMethod(sql, subscriber2.id, {
      value: `test-unassigned-${Date.now()}@example.com`,
      verified: true
    })
    unassignedSubscription = await createTestPeopleGroupSubscription(sql, unassignedPeopleGroup.id, subscriber2.id)
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('GET /api/admin/subscriptions/[id]', () => {
    describe('Authorization', () => {
      it('returns 401 for unauthenticated requests', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`).catch((e) => e)
        expect(error.statusCode).toBe(401)
      })

      it('returns 403 for users with no role', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, noRoleAuth).catch((e) => e)
        expect(error.statusCode).toBe(403)
      })
    })

    describe('Access control', () => {
      it('admin can view any subscriber', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}`, adminAuth)
        expect(response.subscriber).toBeDefined()
      })

      it('people_group_editor can view subscriber from assigned people group', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, editorAuth)
        expect(response.subscriber).toBeDefined()
      })

      it('people_group_editor cannot view subscriber from unassigned people group', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}`, editorAuth).catch((e) => e)
        expect(error.statusCode).toBe(403)
      })
    })

    describe('Response structure', () => {
      it('returns subscriber with expected fields', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, adminAuth)

        expect(response.subscriber).toHaveProperty('id')
        expect(response.subscriber).toHaveProperty('name')
        expect(response.subscriber).toHaveProperty('email')
        expect(response.subscriber).toHaveProperty('status')
      })

      it('returns 404 for non-existent subscription', async () => {
        const error = await $fetch('/api/admin/subscriptions/999999', adminAuth).catch((e) => e)
        expect(error.statusCode).toBe(404)
      })

      it('returns 400 for invalid ID', async () => {
        const error = await $fetch('/api/admin/subscriptions/invalid', adminAuth).catch((e) => e)
        expect(error.statusCode).toBe(400)
      })
    })
  })

  describe('PUT /api/admin/subscriptions/[id]', () => {
    describe('Authorization', () => {
      it('returns 401 for unauthenticated requests', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, {
          method: 'PUT',
          body: { status: 'inactive' }
        }).catch((e) => e)

        expect(error.statusCode).toBe(401)
      })

      it('returns 403 for users with no role', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, {
          method: 'PUT',
          body: { status: 'inactive' },
          ...noRoleAuth
        }).catch((e) => e)

        expect(error.statusCode).toBe(403)
      })
    })

    describe('Access control', () => {
      it('admin can update any subscription', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}`, {
          method: 'PUT',
          body: { status: 'inactive' },
          ...adminAuth
        })

        expect(response.subscription).toBeDefined()
      })

      it('people_group_editor can update subscription from assigned people group', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, {
          method: 'PUT',
          body: { status: 'inactive' },
          ...editorAuth
        })

        expect(response.subscription).toBeDefined()
      })

      it('people_group_editor cannot update subscriber from unassigned people group', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}`, {
          method: 'PUT',
          body: { status: 'inactive' },
          ...editorAuth
        }).catch((e) => e)

        expect(error.statusCode).toBe(403)
      })
    })

    describe('Update operations', () => {
      it('updates status', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, {
          method: 'PUT',
          body: { status: 'inactive' },
          ...adminAuth
        })

        expect(response.subscription).toBeDefined()

        // Verify update
        const check = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, adminAuth)
        expect(check.subscriber.status).toBe('inactive')
      })
    })
  })

  describe('DELETE /api/admin/subscriptions/[id]', () => {
    describe('Authorization', () => {
      it('returns 401 for unauthenticated requests', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, {
          method: 'DELETE'
        }).catch((e) => e)

        expect(error.statusCode).toBe(401)
      })

      it('returns 403 for users with no role', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, {
          method: 'DELETE',
          ...noRoleAuth
        }).catch((e) => e)

        expect(error.statusCode).toBe(403)
      })
    })

    describe('Access control', () => {
      it('admin can delete any subscriber', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}`, {
          method: 'DELETE',
          ...adminAuth
        })

        expect(response.success).toBe(true)
      })

      it('people_group_editor can delete subscriber from assigned people group', async () => {
        const response = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}`, {
          method: 'DELETE',
          ...editorAuth
        })

        expect(response.success).toBe(true)
      })

      it('people_group_editor cannot delete subscriber from unassigned people group', async () => {
        const error = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}`, {
          method: 'DELETE',
          ...editorAuth
        }).catch((e) => e)

        expect(error.statusCode).toBe(403)
      })
    })

    describe('Deletion', () => {
      it('returns 404 for non-existent subscription', async () => {
        const error = await $fetch('/api/admin/subscriptions/999999', {
          method: 'DELETE',
          ...adminAuth
        }).catch((e) => e)

        expect(error.statusCode).toBe(404)
      })
    })
  })
})
