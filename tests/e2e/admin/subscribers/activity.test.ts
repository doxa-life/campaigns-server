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

describe('GET /api/admin/subscriptions/[id]/activity', async () => {
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
      value: `test-activity-assigned-${Date.now()}@example.com`,
      verified: true
    })
    assignedSubscription = await createTestPeopleGroupSubscription(sql, assignedPeopleGroup.id, subscriber1.id)

    // Create subscriber in unassigned people group
    const subscriber2 = await createTestSubscriber(sql, { name: 'Test Unassigned Subscriber' })
    await createTestContactMethod(sql, subscriber2.id, {
      value: `test-activity-unassigned-${Date.now()}@example.com`,
      verified: true
    })
    unassignedSubscription = await createTestPeopleGroupSubscription(sql, unassignedPeopleGroup.id, subscriber2.id)
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}/activity`).catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}/activity`, noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('Access control', () => {
    it('admin can view activity for any subscriber', async () => {
      const response = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}/activity`, adminAuth)
      expect(response.activities).toBeDefined()
    })

    it('people_group_editor can view activity for subscriber from assigned people group', async () => {
      const response = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}/activity`, editorAuth)
      expect(response.activities).toBeDefined()
    })

    it('people_group_editor cannot view activity for subscriber from unassigned people group', async () => {
      const error = await $fetch(`/api/admin/subscriptions/${unassignedSubscription.id}/activity`, editorAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('Response structure', () => {
    it('returns activities array', async () => {
      const response = await $fetch(`/api/admin/subscriptions/${assignedSubscription.id}/activity`, adminAuth)

      expect(response.activities).toBeDefined()
      expect(Array.isArray(response.activities)).toBe(true)
    })

    it('returns 404 for non-existent subscription', async () => {
      const error = await $fetch('/api/admin/subscriptions/999999/activity', adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })

    it('returns 400 for invalid ID', async () => {
      const error = await $fetch('/api/admin/subscriptions/invalid/activity', adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })
  })
})
