import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData
} from '../../../helpers/db'
import {
  createAdminUser,
  createProgressAdminUser,
  createEditorUser,
  getAuthHeaders
} from '../../../helpers/auth'

describe('Stats email defaults by role', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    const admin = await createAdminUser(sql)
    adminAuth = admin.auth
  })

  afterAll(async () => {
    await sql`DELETE FROM user_invitations WHERE email LIKE 'test-%@example.com'`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('an invited admin receives monthly and yearly stats emails', async () => {
    const email = 'test-invited-admin@example.com'
    const invite = await $fetch<{ invitation: { token: string } }>('/api/admin/users/invite', {
      method: 'POST',
      body: { email, roles: ['admin'] },
      ...adminAuth
    })
    await $fetch('/api/auth/accept-invitation', {
      method: 'POST',
      body: { token: invite.invitation.token, password: 'testpassword123', display_name: 'Invited Admin' }
    })

    const [user] = await sql`SELECT id, email, display_name, verified, roles FROM users WHERE email = ${email}`
    const prefs = await $fetch('/api/admin/profile/activity-emails', getAuthHeaders(user as any))
    expect(prefs).toEqual({ daily: false, weekly: false, monthly: true, yearly: true })
  })

  it('a progress admin receives monthly and yearly stats emails', async () => {
    const { auth } = await createProgressAdminUser(sql)
    const prefs = await $fetch('/api/admin/profile/activity-emails', auth)
    expect(prefs).toEqual({ daily: false, weekly: false, monthly: true, yearly: true })
  })

  it('other roles receive no stats emails', async () => {
    const { auth } = await createEditorUser(sql)
    const prefs = await $fetch('/api/admin/profile/activity-emails', auth)
    expect(prefs).toEqual({ daily: false, weekly: false, monthly: false, yearly: false })
  })

  it('an admin can opt out of the monthly stats email', async () => {
    const { auth } = await createAdminUser(sql)
    await $fetch('/api/admin/profile/activity-emails', { method: 'PATCH', body: { monthly: false }, ...auth })
    const prefs = await $fetch('/api/admin/profile/activity-emails', auth)
    expect(prefs).toEqual({ daily: false, weekly: false, monthly: false, yearly: true })
  })
})
