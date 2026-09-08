import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestChurch,
} from '../../../helpers/db'
import { createAdminUser, createNoRoleUser, createEditorUser } from '../../../helpers/auth'

describe('Church CRUD API', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let editorAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
    noRoleAuth = (await createNoRoleUser(sql)).auth
    editorAuth = (await createEditorUser(sql)).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('GET /api/admin/churches', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const error = await $fetch('/api/admin/churches').catch((e) => e)
      expect(error.statusCode).toBe(401)
    })

    it('returns 403 for users without the churches permission', async () => {
      const noRole = await $fetch('/api/admin/churches', noRoleAuth).catch((e) => e)
      expect(noRole.statusCode).toBe(403)
      const editor = await $fetch('/api/admin/churches', editorAuth).catch((e) => e)
      expect(editor.statusCode).toBe(403)
    })

    it('lists churches and searches by name, town or pastor', async () => {
      await createTestChurch(sql, { name: 'Test Church Alpha', town: 'Rivertown', pastor_name: 'Test Pastor Amos' })
      await createTestChurch(sql, { name: 'Test Church Beta', town: 'Hillside', pastor_name: 'Test Pastor Ruth' })

      const all = await $fetch('/api/admin/churches', adminAuth)
      expect(all.churches.map((c: any) => c.name)).toEqual(expect.arrayContaining(['Test Church Alpha', 'Test Church Beta']))
      expect(all.total).toBe(all.churches.length)

      const byTown = await $fetch('/api/admin/churches?search=hillside', adminAuth)
      expect(byTown.churches.map((c: any) => c.name)).toEqual(['Test Church Beta'])

      const byPastor = await $fetch('/api/admin/churches?search=amos', adminAuth)
      expect(byPastor.churches.map((c: any) => c.name)).toEqual(['Test Church Alpha'])
    })
  })

  describe('POST /api/admin/churches', () => {
    it('returns 403 for users without churches.create', async () => {
      const error = await $fetch('/api/admin/churches', {
        method: 'POST',
        body: { name: 'Test Church Denied' },
        ...editorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('requires a name', async () => {
      const error = await $fetch('/api/admin/churches', {
        method: 'POST',
        body: { name: '   ', town: 'Somewhere' },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('rejects an unknown country', async () => {
      const error = await $fetch('/api/admin/churches', {
        method: 'POST',
        body: { name: 'Test Church Nowhere', country: 'Atlantis' },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('queues a lookup when a town and country are given', async () => {
      const response = await $fetch('/api/admin/churches', {
        method: 'POST',
        body: {
          name: '  Test Church Grace  ',
          town: 'Rangpur',
          country: 'bd',
          pastor_name: 'Test Pastor Joseph',
          pastor_phone: '+880 1700 000000',
          pastor_email: 'test-pastor@example.com',
          congregation_size: 'about 45',
          service_language: 'Bengali'
        },
        ...adminAuth
      })

      expect(response.church.name).toBe('Test Church Grace')
      expect(response.church.country).toBe('BD')
      expect(response.church.congregation_size).toBe(45)
      expect(response.church.service_language).toBe('Bengali')
      expect(response.church.location_status).toBe('pending')
      expect(response.church.latitude).toBeNull()
    })

    it('has no location status without a town', async () => {
      const response = await $fetch('/api/admin/churches', {
        method: 'POST',
        body: { name: 'Test Church Unplaced', country: 'BD' },
        ...adminAuth
      })
      expect(response.church.location_status).toBeNull()
    })

    it('marks coordinates given on create as manual', async () => {
      const response = await $fetch('/api/admin/churches', {
        method: 'POST',
        body: { name: 'Test Church Pinned', town: 'Rangpur', country: 'BD', latitude: 25.7439, longitude: 89.2752 },
        ...adminAuth
      })
      expect(response.church.location_status).toBe('manual')
      expect(response.church.latitude).toBeCloseTo(25.7439)
      expect(response.church.longitude).toBeCloseTo(89.2752)
    })

    it('rejects a lone coordinate', async () => {
      const error = await $fetch('/api/admin/churches', {
        method: 'POST',
        body: { name: 'Test Church Half', latitude: 25.7 },
        ...adminAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('GET /api/admin/churches/[id]', () => {
    it('returns the church', async () => {
      const church = await createTestChurch(sql, { name: 'Test Church Fetch', town: 'Somewhere' })
      const response = await $fetch(`/api/admin/churches/${church.id}`, adminAuth)
      expect(response.church.id).toBe(church.id)
      expect(response.church.town).toBe('Somewhere')
    })

    it('returns 404 for a missing church', async () => {
      const error = await $fetch('/api/admin/churches/999999', adminAuth).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('PUT /api/admin/churches/[id]', () => {
    it('updates fields without touching a geocoded location', async () => {
      const church = await createTestChurch(sql, {
        name: 'Test Church Update', town: 'Rangpur', country: 'BD',
        latitude: 25.74, longitude: 89.27, location_status: 'geocoded'
      })
      const response = await $fetch(`/api/admin/churches/${church.id}`, {
        method: 'PUT',
        body: { pastor_name: 'Test Pastor New', congregation_size: 120 },
        ...adminAuth
      })
      expect(response.church.pastor_name).toBe('Test Pastor New')
      expect(response.church.congregation_size).toBe(120)
      expect(response.church.location_status).toBe('geocoded')
      expect(response.church.latitude).toBeCloseTo(25.74)
    })

    it('re-queues the lookup when the town changes', async () => {
      const church = await createTestChurch(sql, {
        name: 'Test Church Moved', town: 'Rangpur', country: 'BD',
        latitude: 25.74, longitude: 89.27, location_status: 'geocoded'
      })
      const response = await $fetch(`/api/admin/churches/${church.id}`, {
        method: 'PUT',
        body: { town: 'Dinajpur' },
        ...adminAuth
      })
      expect(response.church.location_status).toBe('pending')
      expect(response.church.latitude).toBeNull()
      expect(response.church.longitude).toBeNull()
    })

    it('keeps a hand-placed pin when the town changes', async () => {
      const church = await createTestChurch(sql, {
        name: 'Test Church Handplaced', town: 'Rangpur', country: 'BD',
        latitude: 25.74, longitude: 89.27, location_status: 'manual'
      })
      const response = await $fetch(`/api/admin/churches/${church.id}`, {
        method: 'PUT',
        body: { town: 'Dinajpur' },
        ...adminAuth
      })
      expect(response.church.location_status).toBe('manual')
      expect(response.church.latitude).toBeCloseTo(25.74)
    })

    it('marks the location manual when coordinates are sent', async () => {
      const church = await createTestChurch(sql, { name: 'Test Church Dragged', town: 'Rangpur', country: 'BD', location_status: 'not_found' })
      const response = await $fetch(`/api/admin/churches/${church.id}`, {
        method: 'PUT',
        body: { latitude: 25.1, longitude: 89.1 },
        ...adminAuth
      })
      expect(response.church.location_status).toBe('manual')
      expect(response.church.latitude).toBeCloseTo(25.1)
    })

    it('clearing the pin queues a lookup again', async () => {
      const church = await createTestChurch(sql, {
        name: 'Test Church Cleared', town: 'Rangpur', country: 'BD',
        latitude: 25.1, longitude: 89.1, location_status: 'manual'
      })
      const response = await $fetch(`/api/admin/churches/${church.id}`, {
        method: 'PUT',
        body: { latitude: null, longitude: null },
        ...adminAuth
      })
      expect(response.church.location_status).toBe('pending')
      expect(response.church.latitude).toBeNull()
    })

    it('returns 403 for users without churches.edit', async () => {
      const church = await createTestChurch(sql, { name: 'Test Church Locked' })
      const error = await $fetch(`/api/admin/churches/${church.id}`, {
        method: 'PUT',
        body: { name: 'Test Church Renamed' },
        ...editorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('POST /api/admin/churches/[id]/geocode', () => {
    it('queues a fresh lookup and drops the old pin', async () => {
      const church = await createTestChurch(sql, {
        name: 'Test Church Relook', town: 'Rangpur', country: 'BD',
        latitude: 25.1, longitude: 89.1, location_status: 'manual'
      })
      const response = await $fetch(`/api/admin/churches/${church.id}/geocode`, { method: 'POST', ...adminAuth })
      expect(response.church.location_status).toBe('pending')
      expect(response.church.latitude).toBeNull()
    })

    it('returns 400 without a town and country', async () => {
      const church = await createTestChurch(sql, { name: 'Test Church Nowhere' })
      const error = await $fetch(`/api/admin/churches/${church.id}/geocode`, { method: 'POST', ...adminAuth }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('GET /api/admin/churches/service-languages', () => {
    it('lists distinct languages already entered', async () => {
      await createTestChurch(sql, { name: 'Test Church Lang A', service_language: 'Test Santali' })
      await createTestChurch(sql, { name: 'Test Church Lang B', service_language: 'Test Santali' })
      const response = await $fetch('/api/admin/churches/service-languages', adminAuth)
      expect(response.languages.filter((l: string) => l === 'Test Santali')).toHaveLength(1)
    })
  })

  describe('DELETE /api/admin/churches/[id]', () => {
    it('deletes the church and its comments', async () => {
      const church = await createTestChurch(sql, { name: 'Test Church Doomed' })
      await $fetch('/api/admin/comments', {
        method: 'POST',
        body: { record_type: 'church', record_id: church.id, content: { type: 'doc', content: [] } },
        ...adminAuth
      })

      const response = await $fetch(`/api/admin/churches/${church.id}`, { method: 'DELETE', ...adminAuth })
      expect(response.success).toBe(true)

      const [row] = await sql`SELECT id FROM churches WHERE id = ${church.id}`
      expect(row).toBeUndefined()
      const comments = await sql`SELECT id FROM comments WHERE record_type = 'church' AND record_id = ${church.id}`
      expect(comments).toHaveLength(0)
    })

    it('returns 404 for a missing church', async () => {
      const error = await $fetch('/api/admin/churches/999999', { method: 'DELETE', ...adminAuth }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })
  })
})
