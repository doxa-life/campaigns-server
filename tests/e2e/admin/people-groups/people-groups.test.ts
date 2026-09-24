import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData
} from '../../../helpers/db'
import {
  createAdminUser,
  createEditorUser,
  createNoRoleUser
} from '../../../helpers/auth'

describe('People Groups API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)

    const admin = await createAdminUser(sql)
    adminAuth = admin.auth

    const editor = await createEditorUser(sql)
    editorAuth = editor.auth

    const noRole = await createNoRoleUser(sql)
    noRoleAuth = noRole.auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('GET /api/admin/people-groups', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('succeeds for authenticated users', async () => {
      const response = await $fetch('/api/admin/people-groups', adminAuth)
      expect(response.peopleGroups).toBeDefined()
      expect(Array.isArray(response.peopleGroups)).toBe(true)
    })

    it('succeeds for people_group_editor users (scoped)', async () => {
      const response = await $fetch('/api/admin/people-groups', editorAuth)
      expect(response.peopleGroups).toBeDefined()
    })

    it('returns 403 for users with no role (admin only)', async () => {
      const error = await $fetch('/api/admin/people-groups', noRoleAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('GET /api/admin/people-groups/field-options', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups/field-options').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns field options with categories and fields for authenticated users', async () => {
      const response = await $fetch('/api/admin/people-groups/field-options', adminAuth)
      expect(response).toBeDefined()
      expect(response.categories).toBeDefined()
      expect(response.fields).toBeDefined()
      expect(response.fieldsByCategory).toBeDefined()
      expect(Array.isArray(response.categories)).toBe(true)
      expect(Array.isArray(response.fields)).toBe(true)
    })

    it('returns options for a specific field', async () => {
      const response = await $fetch('/api/admin/people-groups/field-options?field=imb_region', adminAuth)
      expect(response).toBeDefined()
      expect(response.options).toBeDefined()
      expect(Array.isArray(response.options)).toBe(true)
    })

    it('indicates optionsSource for dynamic fields', async () => {
      const response = await $fetch('/api/admin/people-groups/field-options?field=country_code', adminAuth)
      expect(response).toBeDefined()
      expect(response.optionsSource).toBe('countries')
    })
  })

  describe('GET /api/admin/people-groups/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups/1').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 404 for non-existent people group', async () => {
      const error = await $fetch('/api/admin/people-groups/999999', adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('PUT /api/admin/people-groups/[id]', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/people-groups/1', {
        method: 'PUT',
        body: { name: 'Updated Name' }
      }).catch((e) => e)

      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users with no role', async () => {
      const error = await $fetch('/api/admin/people-groups/1', {
        method: 'PUT',
        body: { name: 'Updated Name' },
        ...noRoleAuth
      }).catch((e) => e)

      expect(error.statusCode).toBe(403)
    })
  })

  describe('bundle removal tag', () => {
    async function createGroup(tags: string[]) {
      const [row] = await sql`
        INSERT INTO people_groups (name, slug, status, tags)
        VALUES ('Test Bundle Group', ${'test-bundle-' + Math.random().toString(36).slice(2, 10)}, 'active', ${sql.json(tags)})
        RETURNING id
      `
      return row!.id as number
    }

    async function tagsOf(id: number): Promise<string[]> {
      const [row] = await sql`SELECT tags FROM people_groups WHERE id = ${id}`
      return row!.tags
    }

    it('archiving a group requests its removal from the bundle and keeps its other tags', async () => {
      const id = await createGroup(['imb'])
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { status: 'archived' }, ...adminAuth })
      expect(await tagsOf(id)).toEqual(['imb', 'needs:bundle-removal'])
    })

    it('adds the tag to tags sent alongside the status change', async () => {
      const id = await createGroup([])
      await $fetch(`/api/admin/people-groups/${id}`, {
        method: 'PUT',
        body: { status: 'archived', tags: ['sent'] },
        ...adminAuth
      })
      expect(await tagsOf(id)).toEqual(['sent', 'needs:bundle-removal'])
    })

    it('reactivating a group withdraws the request', async () => {
      const id = await createGroup(['imb'])
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { status: 'archived' }, ...adminAuth })
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { status: 'active' }, ...adminAuth })
      expect(await tagsOf(id)).toEqual(['imb'])
    })

    it('leaves the tag cleared when an archived group is saved again', async () => {
      const id = await createGroup([])
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { status: 'archived' }, ...adminAuth })
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { tags: [] }, ...adminAuth })
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { status: 'archived', name: 'Renamed' }, ...adminAuth })
      expect(await tagsOf(id)).toEqual([])
    })

    it('lists an archived group on the onboarding status with only its removal tag', async () => {
      const id = await createGroup(['needs:qr-code'])
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { status: 'archived' }, ...adminAuth })

      const response = await $fetch<{ peopleGroups: any[] }>('/api/admin/people-groups/onboarding-status', adminAuth)
      const row = response.peopleGroups.find(r => r.id === id)
      expect(row).toBeDefined()
      expect(row.needs_tags).toEqual(['needs:bundle-removal'])
      expect(row.prompts_pending).toBe(false)
      expect(row.translation_pending_locales).toEqual([])
      expect(row.tags).toEqual(['needs:qr-code', 'needs:bundle-removal'])
    })

    it('drops an archived group from the onboarding status once the tag is cleared', async () => {
      const id = await createGroup([])
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { status: 'archived' }, ...adminAuth })
      await $fetch(`/api/admin/people-groups/${id}`, { method: 'PUT', body: { tags: [] }, ...adminAuth })

      const response = await $fetch<{ peopleGroups: any[] }>('/api/admin/people-groups/onboarding-status', adminAuth)
      expect(response.peopleGroups.find(r => r.id === id)).toBeUndefined()
    })
  })

})
