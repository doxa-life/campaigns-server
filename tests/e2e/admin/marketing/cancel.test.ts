import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData
} from '../../../helpers/db'
import {
  createAdminUser,
  createNoRoleUser
} from '../../../helpers/auth'

const contentJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }

// The job processor is disabled under VITEST, so queued recipient jobs stay
// pending — letting us assert that cancel deletes them deterministically.
describe('POST /api/admin/marketing/emails/[id]/cancel', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  async function createAndSend() {
    const created = await $fetch('/api/admin/marketing/emails', {
      method: 'POST',
      body: { subject: 'Cancelable Email', content_json: contentJson, audience_type: 'admins' },
      ...adminAuth
    })
    const id = created.email.id
    const sent = await $fetch(`/api/admin/marketing/emails/${id}/send`, { method: 'POST', ...adminAuth })
    return { id, recipientCount: sent.recipient_count }
  }

  it('stops a send and deletes pending recipient jobs', async () => {
    const { id, recipientCount } = await createAndSend()
    expect(recipientCount).toBeGreaterThan(0)

    const cancelled = await $fetch(`/api/admin/marketing/emails/${id}/cancel`, { method: 'POST', ...adminAuth })

    expect(cancelled.success).toBe(true)
    expect(cancelled.cancelledCount).toBe(recipientCount)
    expect(cancelled.stats.pending).toBe(0)

    const detail = await $fetch(`/api/admin/marketing/emails/${id}`, adminAuth)
    expect(detail.email.status).toBe('cancelled')
  })

  it('rejects cancel for a draft that is not sending', async () => {
    const created = await $fetch('/api/admin/marketing/emails', {
      method: 'POST',
      body: { subject: 'Draft Email', content_json: contentJson, audience_type: 'admins' },
      ...adminAuth
    })
    const error = await $fetch(`/api/admin/marketing/emails/${created.email.id}/cancel`, {
      method: 'POST',
      ...adminAuth
    }).catch((e) => e)
    expect(error.statusCode).toBe(400)
  })

  it('returns 403 for users with no role', async () => {
    const error = await $fetch('/api/admin/marketing/emails/1/cancel', {
      method: 'POST',
      ...noRoleAuth
    }).catch((e) => e)
    expect(error.statusCode).toBe(403)
  })
})
