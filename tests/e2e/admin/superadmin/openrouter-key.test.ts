import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData
} from '../../../helpers/db'
import { createAdminUser, createAndLoginUser } from '../../../helpers/auth'

describe('GET /api/admin/superadmin/openrouter-key', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let superadminAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
    superadminAuth = (await createAndLoginUser(sql, 'admin', { superadmin: true })).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('returns 401 for unauthenticated requests', async () => {
    const error = await $fetch('/api/admin/superadmin/openrouter-key').catch((e) => e)
    expect(error.statusCode).toBe(401)
  })

  it('returns 403 for admins who are not superadmin', async () => {
    const error = await $fetch('/api/admin/superadmin/openrouter-key', { ...adminAuth }).catch((e) => e)
    expect(error.statusCode).toBe(403)
  })

  it('reports the key status for superadmins', async () => {
    const data = await $fetch<Record<string, unknown>>('/api/admin/superadmin/openrouter-key', { ...superadminAuth })

    expect(['missing', 'invalid', 'unreachable', 'valid']).toContain(data.status)

    if (data.status === 'valid') {
      expect(typeof data.label).toBe('string')
      expect(typeof data.usage_monthly).toBe('number')
    } else if (data.status === 'missing') {
      expect(Object.keys(data)).toEqual(['status'])
    } else {
      expect(typeof data.message).toBe('string')
    }
  })
})
