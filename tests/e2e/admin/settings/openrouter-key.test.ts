import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData
} from '../../../helpers/db'
import { createAdminUser, createEditorUser } from '../../../helpers/auth'

describe('GET /api/admin/settings/openrouter-key', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
    editorAuth = (await createEditorUser(sql)).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  it('returns 401 for unauthenticated requests', async () => {
    const error = await $fetch('/api/admin/settings/openrouter-key').catch((e) => e)
    expect(error.statusCode).toBe(401)
  })

  it('returns 403 for users without the admin role', async () => {
    const error = await $fetch('/api/admin/settings/openrouter-key', { ...editorAuth }).catch((e) => e)
    expect(error.statusCode).toBe(403)
  })

  it('reports the key status for admins', async () => {
    const data = await $fetch<Record<string, unknown>>('/api/admin/settings/openrouter-key', { ...adminAuth })

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
