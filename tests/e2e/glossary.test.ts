import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  seedGlossaryLanguage,
  seedEnglishAcronyms,
  splitTranslationAcronyms,
  seedTranslationAcronyms,
  seedEnglishContext,
  stripTranslationParentheticals,
  seedMissingChromeLabels
} from '../../migrations/lib/glossary-seed.js'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../helpers/db'
import { createAdminUser, createNoRoleUser } from '../helpers/auth'

describe('Glossary', async () => {
  const sql = getTestDatabase()

  let adminAuth: { headers: { cookie: string } }
  let noRoleAuth: { headers: { cookie: string } }
  let languageId: string
  let sectionId: string
  let termId: string
  let passToken: string

  beforeAll(async () => {
    await cleanupTestData(sql)

    adminAuth = (await createAdminUser(sql)).auth
    noRoleAuth = (await createNoRoleUser(sql)).auth

    const [section] = await sql`
      INSERT INTO glossary_sections (title, intro, position)
      VALUES ('Test Glossary Section', 'For tests.', 999)
      RETURNING id
    `
    sectionId = section!.id

    const [term] = await sql`
      INSERT INTO glossary_terms (section_id, term, fields, position)
      VALUES (
        ${sectionId},
        'Test people group',
        ${sql.json([{ label: 'Why it matters', value: 'It is the unit of measurement.' }] as any)}::jsonb,
        0
      )
      RETURNING id
    `
    termId = term!.id

    const [language] = await sql`
      INSERT INTO glossary_languages (code, name_en, name_local, chrome)
      VALUES ('zz', 'Testish', 'testiska', ${sql.json({ labels: { confirm: 'Vahvista' } })}::jsonb)
      RETURNING id
    `
    languageId = language!.id

    await sql`
      INSERT INTO glossary_translations (language_id, term_id, value, status)
      VALUES (${languageId}, ${termId}, 'testgrupp', 'draft')
    `
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('Seed data', () => {
    it('ships the English glossary and its reviewed languages', async () => {
      const [terms] = await sql`SELECT COUNT(*)::int AS count FROM glossary_terms WHERE seed = TRUE`
      expect(terms!.count).toBeGreaterThan(0)

      const languages = await sql`SELECT code FROM glossary_languages`
      expect(languages.map(row => row.code)).toEqual(expect.arrayContaining(['de', 'es', 'fr', 'pt']))
    })

    it('carries no retired terminology', async () => {
      const rows = await sql`SELECT term FROM glossary_terms WHERE term ILIKE '%24-hour%'`
      expect(rows.length).toBe(0)
    })

    it('keeps acronyms out of the headword and on their own field', async () => {
      const terms = await sql`SELECT term, acronym FROM glossary_terms WHERE acronym IS NOT NULL ORDER BY term`
      expect(terms.map(row => row.acronym)).toEqual(['CPM', 'UUPG', 'UPG'])
      expect(terms.every(row => !row.term.includes('('))).toBe(true)

      const [german] = await sql`
        SELECT tr.value, tr.acronym FROM glossary_translations tr
        JOIN glossary_terms gt ON gt.id = tr.term_id
        JOIN glossary_languages gl ON gl.id = tr.language_id
        WHERE gl.code = 'de' AND gt.term = 'Unreached people group'
      `
      expect(german).toMatchObject({ value: 'unerreichte Volksgruppe', acronym: 'UVG' })

      // Italian keeps the English acronym, so it stores none.
      const [italian] = await sql`
        SELECT tr.value, tr.acronym FROM glossary_translations tr
        JOIN glossary_terms gt ON gt.id = tr.term_id
        JOIN glossary_languages gl ON gl.id = tr.language_id
        WHERE gl.code = 'it' AND gt.term = 'Unreached people group'
      `
      expect(italian).toMatchObject({ value: 'gruppo etnico non raggiunto', acronym: null })

      const [language] = await sql`SELECT chrome FROM glossary_languages WHERE code = 'de'`
      expect(language!.chrome.labels.acronym).toBe('Abkürzung')
    })

    it('keeps the phrase a term is used in as a Context annotation, not in the headword', async () => {
      const [withParens] = await sql`SELECT COUNT(*)::int AS count FROM glossary_terms WHERE term LIKE '%(%'`
      expect(withParens!.count).toBe(0)

      const [term] = await sql`SELECT fields FROM glossary_terms WHERE term = 'Unengaged'`
      expect(term!.fields[0]).toEqual({ label: 'Context', value: 'an unengaged people group' })

      const rows = await sql`
        SELECT gl.code, tr.value FROM glossary_translations tr
        JOIN glossary_terms gt ON gt.id = tr.term_id
        JOIN glossary_languages gl ON gl.id = tr.language_id
        WHERE gt.term IN ('Daily prayer', 'Apostolic effort') AND gl.code IN ('de', 'zh')
        ORDER BY gl.code, gt.term
      `
      expect(rows).toEqual([
        { code: 'de', value: 'apostolischer Einsatz in der Pionierphase' },
        { code: 'de', value: 'tägliches Gebet' },
        { code: 'zh', value: '使徒性开拓性努力' },
        { code: 'zh', value: '每日祷告' }
      ])

      const [language] = await sql`SELECT chrome FROM glossary_languages WHERE code = 'de'`
      expect(language!.chrome.field_labels.Context).toBe('Kontext auf Englisch')
    })
  })

  describe('Seeding a reviewed language file', () => {
    const languagesDir = mkdtempSync(join(tmpdir(), 'glossary-seed-'))

    it('inserts the language and its drafted terms, then skips a second run', async () => {
      const [extraTerm] = await sql`
        INSERT INTO glossary_terms (section_id, term, position)
        VALUES (${sectionId}, 'Test seed term', 1)
        RETURNING id
      `

      writeFileSync(join(languagesDir, 'zzs.json'), JSON.stringify({
        locale_code: 'zzs',
        language_name_en: 'Seedish',
        language_name_local: 'seediska',
        text_direction: 'rtl',
        instructions: { local_heading: 'Ohjeet' },
        labels: { approve_local: 'Hyväksy' },
        suggested_terms: {
          'Test people group': { value: 'seedgrupp', note: 'The reviewer preferred it.', status: 'flagged' },
          'Test seed term': { value: 'seedterm', acronym: 'TST' },
          'Not a glossary term': 'ignored'
        }
      }))

      const first = await seedGlossaryLanguage(sql, 'zzs', { languagesDir })
      expect(first).toEqual({ code: 'zzs', seeded: 2, skipped: false })

      const [language] = await sql`
        SELECT id, name_en, name_local, text_direction, chrome FROM glossary_languages WHERE code = 'zzs'
      `
      expect(language!.name_en).toBe('Seedish')
      expect(language!.name_local).toBe('seediska')
      expect(language!.text_direction).toBe('rtl')
      expect(language!.chrome.instructions.heading).toBe('Ohjeet')
      expect(language!.chrome.labels.confirm).toBe('Hyväksy')

      const translations = await sql`
        SELECT value, acronym, status, note FROM glossary_translations
        WHERE language_id = ${language!.id} ORDER BY value
      `
      expect(translations).toHaveLength(2)
      expect(translations[0]).toMatchObject({ value: 'seedgrupp', acronym: null, status: 'flagged', note: 'The reviewer preferred it.' })
      expect(translations[1]).toMatchObject({ value: 'seedterm', acronym: 'TST', status: 'draft', note: null })

      const second = await seedGlossaryLanguage(sql, 'zzs', { languagesDir })
      expect(second).toEqual({ code: 'zzs', seeded: 0, skipped: true })
      const [count] = await sql`SELECT COUNT(*)::int AS count FROM glossary_languages WHERE code = 'zzs'`
      expect(count!.count).toBe(1)

      await sql`DELETE FROM glossary_terms WHERE id = ${extraTerm!.id}`
    })

    it('throws when no reviewed file exists for the code', async () => {
      await expect(seedGlossaryLanguage(sql, 'zzq', { languagesDir })).rejects.toThrow('No reviewed glossary file')
    })
  })

  describe('Splitting acronyms out of stored wording', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'glossary-acronyms-'))
    const englishFile = join(dataDir, 'glossary.en.json')

    it('moves a parenthesised acronym from the headword and each wording to the acronym field', async () => {
      const [composed] = await sql`
        INSERT INTO glossary_terms (section_id, term, position)
        VALUES (${sectionId}, 'Test movement (TM)', 2)
        RETURNING id
      `
      const [own] = await sql`
        INSERT INTO glossary_languages (code, name_en) VALUES ('zza', 'Testish A') RETURNING id
      `
      const [same] = await sql`
        INSERT INTO glossary_languages (code, name_en) VALUES ('zzz', 'Testish Z') RETURNING id
      `
      const [ownTranslation] = await sql`
        INSERT INTO glossary_translations (language_id, term_id, value)
        VALUES (${own!.id}, ${composed!.id}, 'teströrelse (TR)')
        RETURNING id
      `
      await sql`
        INSERT INTO glossary_translations (language_id, term_id, value)
        VALUES (${same!.id}, ${composed!.id}, '测试运动（TM）')
      `
      await sql`
        INSERT INTO glossary_translation_revisions (translation_id, value, status)
        VALUES (${ownTranslation!.id}, 'teströrelse (TR)', 'draft')
      `

      writeFileSync(englishFile, JSON.stringify({
        sections: [{ title: 'Test Glossary Section', entries: [{ term: 'Test movement', acronym: 'TM' }] }]
      }))

      await seedEnglishAcronyms(sql, { englishFile })
      const split = await splitTranslationAcronyms(sql)
      expect(split).toBe(3)

      const [term] = await sql`SELECT term, acronym FROM glossary_terms WHERE id = ${composed!.id}`
      expect(term).toMatchObject({ term: 'Test movement', acronym: 'TM' })

      const [ownRow] = await sql`SELECT value, acronym FROM glossary_translations WHERE id = ${ownTranslation!.id}`
      expect(ownRow).toMatchObject({ value: 'teströrelse', acronym: 'TR' })

      // The English acronym written into the wording is the default, not a choice.
      const [sameRow] = await sql`
        SELECT value, acronym FROM glossary_translations WHERE language_id = ${same!.id} AND term_id = ${composed!.id}
      `
      expect(sameRow).toMatchObject({ value: '测试运动', acronym: null })

      const [revision] = await sql`
        SELECT value, acronym FROM glossary_translation_revisions WHERE translation_id = ${ownTranslation!.id}
      `
      expect(revision).toMatchObject({ value: 'teströrelse', acronym: 'TR' })

      // A second run finds nothing left to split.
      expect(await splitTranslationAcronyms(sql)).toBe(0)
    })

    it('fills acronyms and the review-page label from a reviewed file for wording the file still matches', async () => {
      writeFileSync(join(dataDir, 'zza.json'), JSON.stringify({
        locale_code: 'zza',
        labels: { acronym_local: 'Förkortning', final_term_local: 'Slutgiltig term' },
        field_labels: { Context: 'Sammanhang' },
        suggested_terms: {
          'Test movement': { value: 'teströrelse', acronym: 'TRÖ' },
          'Test people group': { value: 'not what is stored', acronym: 'TPG' }
        }
      }))
      await sql`
        UPDATE glossary_translations SET acronym = NULL
        WHERE language_id = (SELECT id FROM glossary_languages WHERE code = 'zza')
      `
      await sql`
        INSERT INTO glossary_translations (language_id, term_id, value)
        VALUES ((SELECT id FROM glossary_languages WHERE code = 'zza'), ${termId}, 'testgrupp')
      `

      expect(await seedTranslationAcronyms(sql, 'zza', { languagesDir: dataDir })).toBe(1)
      const rows = await sql`
        SELECT gt.term, tr.acronym FROM glossary_translations tr
        JOIN glossary_terms gt ON gt.id = tr.term_id
        WHERE tr.language_id = (SELECT id FROM glossary_languages WHERE code = 'zza')
        ORDER BY gt.term
      `
      expect(rows).toEqual([
        { term: 'Test movement', acronym: 'TRÖ' },
        { term: 'Test people group', acronym: null }
      ])

      expect(await seedMissingChromeLabels(sql, 'zza', { languagesDir: dataDir })).toBe(3)
      await sql`
        UPDATE glossary_languages SET chrome = jsonb_set(chrome, '{labels,final_term}', '"Kept"')
        WHERE code = 'zza'
      `
      expect(await seedMissingChromeLabels(sql, 'zza', { languagesDir: dataDir })).toBe(0)
      const [language] = await sql`SELECT chrome FROM glossary_languages WHERE code = 'zza'`
      expect(language!.chrome.labels).toEqual({ acronym: 'Förkortning', final_term: 'Kept' })
      expect(language!.chrome.field_labels).toEqual({ Context: 'Sammanhang' })

      expect(await seedTranslationAcronyms(sql, 'zzq', { languagesDir: dataDir })).toBe(0)
    })

    it('adds the Context annotation once and strips copied parentheticals from wordings', async () => {
      const [term] = await sql`
        INSERT INTO glossary_terms (section_id, term, fields, position)
        VALUES (${sectionId}, 'Test daily prayer', ${sql.json([{ label: 'Meaning', value: 'Every day.' }] as any)}::jsonb, 4)
        RETURNING id
      `
      const [gloss] = await sql`
        INSERT INTO glossary_terms (section_id, term, position)
        VALUES (${sectionId}, 'Test apostolic effort', 5)
        RETURNING id
      `
      const zza = (await sql`SELECT id FROM glossary_languages WHERE code = 'zza'`)[0]!.id
      const [translation] = await sql`
        INSERT INTO glossary_translations (language_id, term_id, value)
        VALUES (${zza}, ${term!.id}, 'daglig bön (för en folkgrupp)')
        RETURNING id
      `
      await sql`
        INSERT INTO glossary_translation_revisions (translation_id, value, status)
        VALUES (${translation!.id}, 'daglig bön (för en folkgrupp)', 'draft')
      `
      await sql`
        INSERT INTO glossary_translations (language_id, term_id, value)
        VALUES (${zza}, ${gloss!.id}, '使徒性（开拓性）努力')
      `

      writeFileSync(englishFile, JSON.stringify({
        sections: [{
          title: 'Test Glossary Section',
          entries: [{ term: 'Test daily prayer', fields: [['Context', 'daily prayer for a people group'], ['Meaning', 'Every day.']] }]
        }]
      }))
      expect(await seedEnglishContext(sql, { englishFile })).toBe(1)
      expect(await seedEnglishContext(sql, { englishFile })).toBe(0)
      const [updated] = await sql`SELECT fields FROM glossary_terms WHERE id = ${term!.id}`
      expect(updated!.fields).toEqual([
        { label: 'Context', value: 'daily prayer for a people group' },
        { label: 'Meaning', value: 'Every day.' }
      ])

      expect(await stripTranslationParentheticals(sql, ['Test daily prayer'])).toBe(2)
      expect(await stripTranslationParentheticals(sql, ['Test apostolic effort'], { keepWords: true })).toBe(1)
      const values = await sql`
        SELECT gt.term, tr.value FROM glossary_translations tr
        JOIN glossary_terms gt ON gt.id = tr.term_id
        WHERE tr.language_id = ${zza} AND gt.term IN ('Test apostolic effort', 'Test daily prayer')
        ORDER BY gt.term
      `
      expect(values).toEqual([
        { term: 'Test apostolic effort', value: '使徒性开拓性努力' },
        { term: 'Test daily prayer', value: 'daglig bön' }
      ])
      const [revision] = await sql`SELECT value FROM glossary_translation_revisions WHERE translation_id = ${translation!.id}`
      expect(revision!.value).toBe('daglig bön')
      expect(await stripTranslationParentheticals(sql, ['Test daily prayer'])).toBe(0)
    })
  })

  describe('Authorization', () => {
    it('refuses the admin glossary without authentication', async () => {
      const error = await $fetch('/api/admin/glossary/english').catch(e => e)
      expect(error.statusCode).toBe(401)
    })

    it('refuses a user with no role', async () => {
      const error = await $fetch('/api/admin/glossary/languages', noRoleAuth).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('allows an admin', async () => {
      const data = await $fetch<{ sections: any[] }>('/api/admin/glossary/english', adminAuth)
      expect(Array.isArray(data.sections)).toBe(true)
    })
  })

  describe('Public API', () => {
    it('returns full records with review status', async () => {
      const data = await $fetch<any>('/api/glossary/zz')
      expect(data.language.code).toBe('zz')

      const term = data.terms.find((row: any) => row.term === 'Test people group')
      expect(term.translation).toBe('testgrupp')
      expect(term.status).toBe('draft')
      expect(term.fields[0].label).toBe('Why it matters')
    })

    it('renders markdown on request', async () => {
      const markdown = await $fetch<string>('/api/glossary/zz?format=markdown')
      expect(markdown).toContain('# Testish glossary')
      expect(markdown).toContain('testgrupp')
    })

    it('reads in the browser by default and attaches as a file on request', async () => {
      const readable = await rawFetch('/api/glossary/zz?format=markdown')
      expect(readable.headers.get('content-disposition')).toBeNull()

      const attached = await rawFetch('/api/glossary/zz?format=markdown&download=1')
      expect(attached.headers.get('content-disposition')).toBe('attachment; filename="glossary-zz.md"')

      const json = await rawFetch('/api/glossary/zz?download=1')
      expect(json.headers.get('content-disposition')).toBe('attachment; filename="glossary-zz.json"')
    })

    it('publishes the acronym a language uses, the English one unless it chose its own', async () => {
      const [term] = await sql`
        INSERT INTO glossary_terms (section_id, term, acronym, position)
        VALUES (${sectionId}, 'Test acronym term', 'TAT', 3)
        RETURNING id
      `
      await sql`
        INSERT INTO glossary_translations (language_id, term_id, value)
        VALUES (${languageId}, ${term!.id}, 'testakronym')
      `

      let data = await $fetch<any>('/api/glossary/zz')
      let row = data.terms.find((entry: any) => entry.term === 'Test acronym term')
      expect(row).toMatchObject({ acronym: 'TAT', translation: 'testakronym', acronym_translation: 'TAT' })
      expect(data.terms.find((entry: any) => entry.term === 'Test people group').acronym_translation).toBeNull()

      await sql`UPDATE glossary_translations SET acronym = 'TAK' WHERE language_id = ${languageId} AND term_id = ${term!.id}`
      data = await $fetch<any>('/api/glossary/zz')
      row = data.terms.find((entry: any) => entry.term === 'Test acronym term')
      expect(row.acronym_translation).toBe('TAK')

      const markdown = await $fetch<string>('/api/glossary/zz?format=markdown')
      expect(markdown).toContain('| Test acronym term (TAT) | testakronym (TAK) |')
      expect(markdown).toContain('### Test acronym term (TAT) → testakronym (TAK)')
    })

    it('404s for a language with no glossary', async () => {
      const error = await $fetch('/api/glossary/zq').catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('Review passes', () => {
    it('mints a review link', async () => {
      const pass = await $fetch<{ token: string; label: string; status: string }>(
        '/api/admin/glossary/languages/zz/passes',
        { method: 'POST', body: { label: 'Testish pass 1' }, ...adminAuth }
      )
      expect(pass.status).toBe('open')
      expect(pass.token.length).toBeGreaterThan(20)
      passToken = pass.token
    })

    it('rejects an unknown token', async () => {
      const error = await $fetch('/api/glossary/review/not-a-real-token').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('opens the review with both halves of the page wording', async () => {
      const data = await $fetch<any>(`/api/glossary/review/${passToken}`)
      expect(data.language.code).toBe('zz')
      expect(data.chrome_en.instructions.items.length).toBe(8)
      expect(data.chrome_en.instructions.purpose).toContain('Testish')
      expect(data.chrome_local.labels.confirm).toBe('Vahvista')
      expect(data.entries.some((entry: any) => entry.term === 'Test people group')).toBe(true)
    })

    it('refuses term edits until the reviewer names themselves', async () => {
      const error = await $fetch(`/api/glossary/review/${passToken}/terms/${termId}`, {
        method: 'PATCH',
        body: { status: 'confirmed' }
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('rejects a malformed email', async () => {
      const error = await $fetch(`/api/glossary/review/${passToken}/reviewer`, {
        method: 'PATCH',
        body: { reviewer_name: 'Rodica T', reviewer_email: 'not-an-email' }
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('records the reviewer name and email', async () => {
      const pass = await $fetch<{ reviewer_name: string; reviewer_email: string }>(
        `/api/glossary/review/${passToken}/reviewer`,
        { method: 'PATCH', body: { reviewer_name: 'Rodica T', reviewer_email: 'rodica@example.com' } }
      )
      expect(pass.reviewer_name).toBe('Rodica T')
      expect(pass.reviewer_email).toBe('rodica@example.com')
    })

    it('applies an edit immediately and attributes it', async () => {
      const translation = await $fetch<any>(`/api/glossary/review/${passToken}/terms/${termId}`, {
        method: 'PATCH',
        body: { value: 'testgruppen', status: 'confirmed' }
      })
      expect(translation.value).toBe('testgruppen')
      expect(translation.status).toBe('confirmed')
      expect(translation.updated_by_name).toBe('Rodica T')

      const data = await $fetch<any>('/api/glossary/zz')
      const term = data.terms.find((row: any) => row.term === 'Test people group')
      expect(term.translation).toBe('testgruppen')
      expect(term.reviewed_by).toBe('Rodica T')
    })

    it('stores only the language\'s own acronym', async () => {
      const [term] = await sql`SELECT id FROM glossary_terms WHERE term = 'Test acronym term'`

      // The page sends Confirm with the acronym: choosing it is a decision about the term.
      let translation = await $fetch<any>(`/api/glossary/review/${passToken}/terms/${term!.id}`, {
        method: 'PATCH',
        body: { acronym: 'TAR', status: 'confirmed' }
      })
      expect(translation.acronym).toBe('TAR')
      expect(translation.status).toBe('confirmed')

      // The English acronym, however spelled, means no choice of its own.
      translation = await $fetch<any>(`/api/glossary/review/${passToken}/terms/${term!.id}`, {
        method: 'PATCH',
        body: { acronym: 'tat' }
      })
      expect(translation.acronym).toBeNull()

      translation = await $fetch<any>(`/api/glossary/review/${passToken}/terms/${term!.id}`, {
        method: 'PATCH',
        body: { acronym: 'TAR' }
      })
      translation = await $fetch<any>(`/api/glossary/review/${passToken}/terms/${term!.id}`, {
        method: 'PATCH',
        body: { acronym: '' }
      })
      expect(translation.acronym).toBeNull()

      const data = await $fetch<any>('/api/glossary/zz')
      expect(data.terms.find((entry: any) => entry.term === 'Test acronym term').acronym_translation).toBe('TAT')
    })

    it('flags a term with a note', async () => {
      const translation = await $fetch<any>(`/api/glossary/review/${passToken}/terms/${termId}`, {
        method: 'PATCH',
        body: { status: 'flagged', note: 'Two words are in use locally.' }
      })
      expect(translation.status).toBe('flagged')
      expect(translation.note).toBe('Two words are in use locally.')
      // A status change leaves the wording alone.
      expect(translation.value).toBe('testgruppen')
    })

    it('records the language-level Bible translation', async () => {
      const result = await $fetch<any>(`/api/glossary/review/${passToken}/bible`, {
        method: 'PATCH',
        body: { bible_translation: 'Testish Standard Version 1998' }
      })
      expect(result.bible_translation).toBe('Testish Standard Version 1998')
    })

    it('records the language-wide notes and attributes them', async () => {
      const result = await $fetch<any>(`/api/glossary/review/${passToken}/notes`, {
        method: 'PATCH',
        body: { notes: '## Register\nAddress the reader informally.' }
      })
      expect(result.notes).toContain('Address the reader informally.')

      const [revision] = await sql`
        SELECT reviewer_name, source FROM glossary_language_note_revisions
        WHERE language_id = ${languageId}
        ORDER BY created_at DESC LIMIT 1
      `
      expect(revision!.reviewer_name).toBe('Rodica T')
      expect(revision!.source).toBe('review')
    })

    it('refuses notes longer than the prompt budget', async () => {
      const error = await $fetch(`/api/glossary/review/${passToken}/notes`, {
        method: 'PATCH',
        body: { notes: 'x'.repeat(4001) }
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('submits the pass and keeps the link working', async () => {
      const pass = await $fetch<any>(`/api/glossary/review/${passToken}/submit`, { method: 'POST' })
      expect(pass.status).toBe('submitted')
      expect(pass.submitted_at).toBeTruthy()

      const reopened = await $fetch<any>(`/api/glossary/review/${passToken}`)
      expect(reopened.pass.status).toBe('submitted')
    })

    it('stops working once the link is regenerated', async () => {
      const [pass] = await sql`SELECT id FROM glossary_review_passes WHERE token = ${passToken}`
      await $fetch(`/api/admin/glossary/languages/zz/passes/${pass!.id}/regenerate`, {
        method: 'POST',
        ...adminAuth
      })

      const error = await $fetch(`/api/glossary/review/${passToken}`).catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('History', () => {
    it('keeps every wording and restores a prior one', async () => {
      const [translation] = await sql`
        SELECT id FROM glossary_translations WHERE language_id = ${languageId} AND term_id = ${termId}
      `
      const { revisions } = await $fetch<any>(
        `/api/admin/glossary/translations/${translation!.id}/revisions`,
        adminAuth
      )
      expect(revisions.length).toBeGreaterThanOrEqual(2)

      const earlier = revisions.find((revision: any) => revision.value === 'testgruppen' && revision.status === 'confirmed')
      expect(earlier).toBeTruthy()

      const reverted = await $fetch<any>(`/api/admin/glossary/revisions/${earlier.id}/revert`, {
        method: 'POST',
        ...adminAuth
      })
      expect(reverted.value).toBe('testgruppen')
      expect(reverted.status).toBe('confirmed')
    })
  })

  describe('English edits', () => {
    it('creates a term with an acronym and clears it with an empty one', async () => {
      const created = await $fetch<any>('/api/admin/glossary/terms', {
        method: 'POST',
        body: { section_id: sectionId, term: 'Test created term', acronym: ' TCT ' },
        ...adminAuth
      })
      expect(created.acronym).toBe('TCT')

      const updated = await $fetch<any>(`/api/admin/glossary/terms/${created.id}`, {
        method: 'PATCH',
        body: { acronym: '' },
        ...adminAuth
      })
      expect(updated.acronym).toBeNull()
    })

    it('marks confirmed translations stale when the term changes', async () => {
      await sql`
        UPDATE glossary_translations SET status = 'confirmed', stale = FALSE
        WHERE language_id = ${languageId} AND term_id = ${termId}
      `

      await $fetch(`/api/admin/glossary/terms/${termId}`, {
        method: 'PATCH',
        body: { fields: [{ label: 'Why it matters', value: 'Rewritten so the review no longer holds.' }] },
        ...adminAuth
      })

      const [translation] = await sql`
        SELECT status, stale FROM glossary_translations
        WHERE language_id = ${languageId} AND term_id = ${termId}
      `
      expect(translation!.status).toBe('draft')
      expect(translation!.stale).toBe(true)
    })
  })

  describe('Translation notes', () => {
    it('publishes the notes on the public glossary, in both formats', async () => {
      const data = await $fetch<any>('/api/glossary/zz')
      expect(data.notes).toContain('Address the reader informally.')

      const markdown = await $fetch<string>('/api/glossary/zz?format=markdown')
      expect(markdown).toContain('## Rules for Testish')
      expect(markdown).toContain('Address the reader informally.')
    })

    it('lets an admin rewrite them and keeps the reviewer version restorable', async () => {
      await $fetch('/api/admin/glossary/languages/zz/notes', {
        method: 'PATCH',
        body: { notes: '## Register\nAddress the reader formally.' },
        ...adminAuth
      })

      const { revisions } = await $fetch<any>('/api/admin/glossary/languages/zz/notes/revisions', adminAuth)
      expect(revisions[0].source).toBe('admin')

      const reviewerRevision = revisions.find((revision: any) => revision.source === 'review')
      await $fetch(`/api/admin/glossary/note-revisions/${reviewerRevision.id}/revert`, {
        method: 'POST',
        ...adminAuth
      })

      const data = await $fetch<any>('/api/glossary/zz')
      expect(data.notes).toContain('Address the reader informally.')
    })

    it('refuses an over-long write from the admin too', async () => {
      const error = await $fetch('/api/admin/glossary/languages/zz/notes', {
        method: 'PATCH',
        body: { notes: 'x'.repeat(4001) },
        ...adminAuth
      }).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('starts empty for a language nobody has written notes for', async () => {
      const [language] = await sql`
        INSERT INTO glossary_languages (code, name_en) VALUES ('zzc', 'Testish C') RETURNING code
      `
      const data = await $fetch<any>(`/api/glossary/${language!.code}`)
      expect(data.notes).toBe('')
    })
  })

  describe('Languages', () => {
    it('rejects a duplicate code', async () => {
      const error = await $fetch('/api/admin/glossary/languages', {
        method: 'POST',
        body: { code: 'zz', name_en: 'Testish again', draft: false },
        ...adminAuth
      }).catch(e => e)
      expect(error.statusCode).toBe(409)
    })

    it('adds a language with no code change and reports it is not registered', async () => {
      await $fetch('/api/admin/glossary/languages', {
        method: 'POST',
        body: { code: 'zzb', name_en: 'Testish B', draft: false },
        ...adminAuth
      })

      const { languages } = await $fetch<any>('/api/admin/glossary/languages', adminAuth)
      const added = languages.find((language: any) => language.code === 'zzb')
      expect(added.registered_in_code).toBe(false)
    })
  })
})
