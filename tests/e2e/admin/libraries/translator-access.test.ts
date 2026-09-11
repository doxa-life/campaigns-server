import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestLibrary,
  createTestLibraryContent,
  createTestPeopleGroup,
  assignUserToPeopleGroup,
  assignUserLanguages,
  getTestLibraryContent
} from '../../../helpers/db'
import {
  createAdminUser,
  createTranslatorUser,
  createTestUser,
  getAuthHeaders
} from '../../../helpers/auth'

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('Translator (language_editor) access', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let translatorAuth: { headers: { cookie: string } }
  let translatorId: string
  let library: { id: number }
  let enContent: { id: number }
  let esContent: { id: number }
  let frContent: { id: number }

  beforeAll(async () => {
    await cleanupTestData(sql)

    adminAuth = (await createAdminUser(sql)).auth

    const translator = await createTranslatorUser(sql)
    translatorAuth = translator.auth
    translatorId = translator.user.id
    await assignUserLanguages(sql, translatorId, ['es'])

    library = await createTestLibrary(sql, { name: `Test Library Translator ${Date.now()}` })
    enContent = await createTestLibraryContent(sql, library.id, { day_number: 1, language_code: 'en' })
    esContent = await createTestLibraryContent(sql, library.id, { day_number: 1, language_code: 'es' })
    frContent = await createTestLibraryContent(sql, library.id, { day_number: 1, language_code: 'fr' })
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Role and session', () => {
    it('lists the translator role for admins', async () => {
      const response = await $fetch('/api/admin/roles', adminAuth)
      const role = response.roles.find((r: any) => r.name === 'language_editor')
      expect(role).toBeDefined()
      expect(role.label).toBe('Translator')
    })

    it('exposes assigned languages on the auth user', async () => {
      const response = await $fetch('/api/auth/me', translatorAuth)
      expect(response.user.roles).toContain('language_editor')
      expect(response.user.languages).toEqual(['es'])
    })

    it('exposes no languages for users without a language-scoped role', async () => {
      const response = await $fetch('/api/auth/me', adminAuth)
      expect(response.user.languages).toEqual([])
    })
  })

  describe('Reading', () => {
    it('lists all libraries', async () => {
      const response = await $fetch('/api/admin/libraries', translatorAuth)
      expect(response.libraries.some((l: any) => l.id === library.id)).toBe(true)
    })

    it('reads a library and its content in every language', async () => {
      const lib = await $fetch(`/api/admin/libraries/${library.id}`, translatorAuth)
      expect(lib.library.id).toBe(library.id)

      const content = await $fetch(`/api/admin/libraries/${library.id}/content?startDay=1&endDay=1`, translatorAuth)
      const languages = content.content.map((c: any) => c.language_code).sort()
      expect(languages).toEqual(['en', 'es', 'fr'])
    })
  })

  describe('Writing content', () => {
    it('creates content in an assigned language', async () => {
      const response = await $fetch(`/api/admin/libraries/${library.id}/content`, {
        method: 'POST',
        body: { day_number: 2, language_code: 'es', content_json: doc('Día 2') },
        ...translatorAuth
      })
      expect(response.success).toBe(true)
      expect(response.content.language_code).toBe('es')
    })

    it('rejects creating content in an unassigned language', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content`, {
        method: 'POST',
        body: { day_number: 2, language_code: 'fr', content_json: doc('Jour 2') },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('edits content in an assigned language', async () => {
      const response = await $fetch(`/api/admin/libraries/${library.id}/content/${esContent.id}`, {
        method: 'PUT',
        body: { content_json: doc('Editado') },
        ...translatorAuth
      })
      expect(response.success).toBe(true)
      const stored = await getTestLibraryContent(sql, esContent.id)
      expect(JSON.stringify(stored?.content_json)).toContain('Editado')
    })

    it('rejects editing content in an unassigned language', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content/${frContent.id}`, {
        method: 'PUT',
        body: { content_json: doc('Modifié') },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects editing the English source', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content/${enContent.id}`, {
        method: 'PUT',
        body: { content_json: doc('Changed') },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects moving assigned content into an unassigned language', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content/${esContent.id}`, {
        method: 'PUT',
        body: { language_code: 'fr' },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
      const stored = await getTestLibraryContent(sql, esContent.id)
      expect(stored?.language_code).toBe('es')
    })

    it('rejects deleting content in an unassigned language', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content/${frContent.id}`, {
        method: 'DELETE',
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
      expect(await getTestLibraryContent(sql, frContent.id)).not.toBeNull()
    })

    it('deletes content in an assigned language', async () => {
      const row = await createTestLibraryContent(sql, library.id, { day_number: 3, language_code: 'es' })
      const response = await $fetch(`/api/admin/libraries/${library.id}/content/${row.id}`, {
        method: 'DELETE',
        ...translatorAuth
      })
      expect(response.success).toBe(true)
      expect(await getTestLibraryContent(sql, row.id)).toBeNull()
    })

    it('returns 404 for content that does not exist', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content/999999`, {
        method: 'PUT',
        body: { content_json: doc('x') },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('Library-level actions', () => {
    it('rejects creating a library', async () => {
      const error = await $fetch('/api/admin/libraries', {
        method: 'POST',
        body: { name: `Test Library Translator Create ${Date.now()}` },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects renaming a library', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}`, {
        method: 'PUT',
        body: { name: 'Test Library Renamed' },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects deleting a library', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}`, {
        method: 'DELETE',
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects importing into a library', async () => {
      const error = await $fetch('/api/admin/libraries/import', {
        method: 'POST',
        body: { data: { library: { name: 'x' }, content: [] } },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects reading the prayer fuel order config', async () => {
      const error = await $fetch('/api/admin/people-group-config/libraries', translatorAuth).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })

  describe('AI translation', () => {
    it('rejects bulk library translation', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/translate`, {
        method: 'POST',
        body: { source_language: 'en', target_languages: ['es'] },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects cancelling bulk translation jobs', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/translate/cancel`, {
        method: 'POST',
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects per-day translation into an unassigned language', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content/${enContent.id}/translate`, {
        method: 'POST',
        body: { source_language: 'en', target_languages: ['fr'] },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    it('rejects per-day translation when any target is unassigned', async () => {
      const error = await $fetch(`/api/admin/libraries/${library.id}/content/${enContent.id}/translate`, {
        method: 'POST',
        body: { source_language: 'en', target_languages: ['es', 'fr'] },
        ...translatorAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })

    // Existing target content with overwrite off and verse refresh off is skipped
    // without calling the translation service, which keeps this test offline.
    it('allows per-day translation into an assigned language', async () => {
      const response = await $fetch(`/api/admin/libraries/${library.id}/content/${enContent.id}/translate`, {
        method: 'POST',
        body: { source_language: 'en', target_languages: ['es'], overwrite: false, retranslate_verses: false },
        ...translatorAuth
      }).catch((e) => e)
      expect(response.statusCode).not.toBe(403)
      expect(response.results?.[0]?.language).toBe('es')
    })
  })

  describe('Combined with people group editor', () => {
    let comboAuth: { headers: { cookie: string } }
    let pgLibrary: { id: number }
    let pgEnContent: { id: number }
    let otherLibrary: { id: number }

    beforeAll(async () => {
      const peopleGroup = await createTestPeopleGroup(sql, { title: 'Test People Group Translator' })
      const combo = await createTestUser(sql, { role: 'people_group_editor' })
      await sql`UPDATE users SET roles = ${['people_group_editor', 'language_editor']} WHERE id = ${combo.id}`
      await assignUserToPeopleGroup(sql, combo.id, peopleGroup.id)
      await assignUserLanguages(sql, combo.id, ['es'])
      comboAuth = getAuthHeaders(combo)

      pgLibrary = await createTestLibrary(sql, { name: `Test Library PG ${Date.now()}`, people_group_id: peopleGroup.id })
      pgEnContent = await createTestLibraryContent(sql, pgLibrary.id, { day_number: 1, language_code: 'en' })
      otherLibrary = await createTestLibrary(sql, { name: `Test Library Other ${Date.now()}` })
    })

    it('edits any language inside an assigned people group library', async () => {
      const response = await $fetch(`/api/admin/libraries/${pgLibrary.id}/content/${pgEnContent.id}`, {
        method: 'PUT',
        body: { content_json: doc('PG edit') },
        ...comboAuth
      })
      expect(response.success).toBe(true)
    })

    it('creates assigned-language content in a library outside the people group', async () => {
      const response = await $fetch(`/api/admin/libraries/${otherLibrary.id}/content`, {
        method: 'POST',
        body: { day_number: 1, language_code: 'es', content_json: doc('Otro') },
        ...comboAuth
      })
      expect(response.success).toBe(true)
    })

    it('rejects unassigned-language content in a library outside the people group', async () => {
      const error = await $fetch(`/api/admin/libraries/${otherLibrary.id}/content`, {
        method: 'POST',
        body: { day_number: 1, language_code: 'fr', content_json: doc('Autre') },
        ...comboAuth
      }).catch((e) => e)
      expect(error.statusCode).toBe(403)
    })
  })
})
