import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestGroup,
  createTestSubscriber,
  createTestContactMethod,
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'

describe('Comments cleanup on record delete', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }

  const tiptapContent = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test comment' }] }]
  }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('deletes comments when a group is deleted', async () => {
    const group = await createTestGroup(sql)

    // Create a comment on the group
    await $fetch('/api/admin/comments', {
      method: 'POST',
      body: { record_type: 'group', record_id: group.id, content: tiptapContent },
      ...adminAuth
    })

    // Verify comment exists
    const before = await $fetch<{ comments: any[] }>('/api/admin/comments', {
      params: { record_type: 'group', record_id: group.id },
      ...adminAuth
    })
    expect(before.comments).toHaveLength(1)

    // Delete the group
    await $fetch(`/api/admin/groups/${group.id}`, {
      method: 'DELETE',
      ...adminAuth
    })

    // Verify comments are gone (query DB directly since the group no longer exists)
    const remaining = await sql`SELECT * FROM comments WHERE record_type = 'group' AND record_id = ${group.id}`
    expect(remaining).toHaveLength(0)
  })

  it('deletes comments when a subscriber is deleted', async () => {
    const subscriber = await createTestSubscriber(sql)
    await createTestContactMethod(sql, subscriber.id)

    // Create a comment on the subscriber
    await $fetch('/api/admin/comments', {
      method: 'POST',
      body: { record_type: 'subscriber', record_id: subscriber.id, content: tiptapContent },
      ...adminAuth
    })

    // Verify comment exists
    const before = await $fetch<{ comments: any[] }>('/api/admin/comments', {
      params: { record_type: 'subscriber', record_id: subscriber.id },
      ...adminAuth
    })
    expect(before.comments).toHaveLength(1)

    // Delete the subscriber
    await $fetch(`/api/admin/subscribers/${subscriber.id}`, {
      method: 'DELETE',
      ...adminAuth
    })

    // Verify comments are gone
    const remaining = await sql`SELECT * FROM comments WHERE record_type = 'subscriber' AND record_id = ${subscriber.id}`
    expect(remaining).toHaveLength(0)
  })
})
