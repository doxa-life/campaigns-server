import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../helpers/db'
import { createAdminUser, type TestUser, type AuthHeaders } from '../helpers/auth'

// Public /updates suggestion flow: submission + email verification,
// two-approver review, apply per type, and the admin fast-path regression.
describe('People Group Suggestions (/updates)', async () => {
  const sql = getTestDatabase()

  let approver1: { user: TestUser; auth: AuthHeaders }
  let approver2: { user: TestUser; auth: AuthHeaders }
  let otherAdmin: { user: TestUser; auth: AuthHeaders }
  let testGroupId: number

  // Each submit gets its own IP so the per-IP rate limit never trips across runs.
  function ipHeaders() {
    return { 'x-forwarded-for': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }
  }

  function testEmail() {
    return `test-${uuidv4().slice(0, 8)}@example.com`
  }

  async function getReport(id: number) {
    const [row] = await sql`SELECT * FROM people_group_reports WHERE id = ${id}`
    return row
  }

  async function submitSuggestion(body: Record<string, any>) {
    return await $fetch<{ id: number; status: string }>('/api/updates', {
      method: 'POST',
      headers: ipHeaders(),
      body: {
        reporter_name: 'Test Reporter',
        reporter_email: testEmail(),
        ...body
      }
    })
  }

  beforeAll(async () => {
    await cleanupTestData(sql)

    approver1 = await createAdminUser(sql)
    approver2 = await createAdminUser(sql)
    otherAdmin = await createAdminUser(sql)

    await sql`
      INSERT INTO app_config (key, value)
      VALUES ('people_group_report_approvers', ${JSON.stringify([approver1.user.id, approver2.user.id])})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `

    const [group] = await sql`
      INSERT INTO people_groups (name, slug, population, status, engagement_status)
      VALUES ('Test Suggestion Group', ${'test-suggestion-group-' + uuidv4().slice(0, 8)}, 1000, 'active', 'unengaged')
      RETURNING id
    `
    testGroupId = group!.id
  })

  afterAll(async () => {
    await sql`DELETE FROM app_config WHERE key = 'people_group_report_approvers'`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  describe('public submission', () => {
    it('rejects an invalid type', async () => {
      const error = await submitSuggestion({ type: 'nonsense', suggested_changes: {} }).catch((e) => e)
      expect(error.statusCode).toBe(400)
    })

    it('requires reporter name and valid email', async () => {
      const noName = await $fetch('/api/updates', {
        method: 'POST',
        headers: ipHeaders(),
        body: { type: 'update', reporter_name: '', reporter_email: testEmail(), people_group_id: testGroupId, suggested_changes: { population: 5 } }
      }).catch((e) => e)
      expect(noName.statusCode).toBe(400)

      const badEmail = await submitSuggestion({
        type: 'update',
        reporter_email: 'not-an-email',
        people_group_id: testGroupId,
        suggested_changes: { population: 5 }
      }).catch((e) => e)
      expect(badEmail.statusCode).toBe(400)
    })

    it('requires a people group for update, a name for add, a reason for remove', async () => {
      const noGroup = await submitSuggestion({ type: 'update', suggested_changes: { population: 5 } }).catch((e) => e)
      expect(noGroup.statusCode).toBe(400)

      const noName = await submitSuggestion({ type: 'add', suggested_changes: { population: 5 } }).catch((e) => e)
      expect(noName.statusCode).toBe(400)

      const noReason = await submitSuggestion({ type: 'remove', people_group_id: testGroupId, suggested_changes: {} }).catch((e) => e)
      expect(noReason.statusCode).toBe(400)
    })

    it('requires a comment for add and remove suggestions', async () => {
      const addNoComment = await submitSuggestion({
        type: 'add',
        suggested_changes: { name: 'Test Commentless Group' }
      }).catch((e) => e)
      expect(addNoComment.statusCode).toBe(400)

      const removeNoComment = await submitSuggestion({
        type: 'remove',
        people_group_id: testGroupId,
        suggested_changes: { reason_unlisted: 'no_longer_exists' }
      }).catch((e) => e)
      expect(removeNoComment.statusCode).toBe(400)
    })

    it('holds unverified submissions as awaiting_verification and promotes on email verify', async () => {
      const email = testEmail()
      const res = await submitSuggestion({
        type: 'update',
        reporter_email: email,
        people_group_id: testGroupId,
        suggested_changes: { population: 2222 }
      })
      expect(res.status).toBe('awaiting_verification')

      const report = await getReport(res.id)
      expect(report!.source).toBe('public')
      expect(report!.type).toBe('update')
      expect(report!.reporter_contact_method_id).not.toBeNull()

      const [cm] = await sql`SELECT verification_token FROM contact_methods WHERE LOWER(value) = ${email}`
      expect(cm!.verification_token).toBeTruthy()

      const verifyRes = await rawFetch(`/api/updates/verify?token=${cm!.verification_token}`, {
        redirect: 'manual'
      })
      expect([301, 302]).toContain(verifyRes.status)
      expect(verifyRes.headers.get('location')).toContain('verified=1')

      const promoted = await getReport(res.id)
      expect(promoted!.status).toBe('pending')
    })

    it('skips verification for an already-verified email', async () => {
      const email = testEmail()
      await sql`INSERT INTO contact_methods (subscriber_id, type, value, verified) VALUES (NULL, 'email', ${email}, true)`

      const res = await submitSuggestion({
        type: 'update',
        reporter_email: email,
        people_group_id: testGroupId,
        suggested_changes: { population: 3333 }
      })
      expect(res.status).toBe('pending')
    })

    it('whitelists suggested fields and stores reporter/verifier details', async () => {
      const res = await submitSuggestion({
        type: 'update',
        people_group_id: testGroupId,
        reporter_org: 'Test Org',
        verifier_name: 'Test Verifier',
        verifier_entity: 'Verify Org',
        verifier_email: 'test-verifier@example.com',
        comments: 'How I know this people group',
        suggested_changes: {
          population: 4444,
          slug: 'hacked-slug',
          people_praying: 999,
          status: 'archived'
        }
      })

      const report = await getReport(res.id)
      expect(report!.suggested_changes).toEqual({ population: 4444 })
      expect(report!.reporter_org).toBe('Test Org')
      expect(report!.verifier_name).toBe('Test Verifier')
      expect(report!.verifier_entity).toBe('Verify Org')
      expect(report!.verifier_email).toBe('test-verifier@example.com')
      expect(report!.notes).toBe('How I know this people group')
    })
  })

  describe('two-approver review flow', () => {
    async function createPendingUpdate(changes: Record<string, any>) {
      const email = testEmail()
      await sql`INSERT INTO contact_methods (subscriber_id, type, value, verified) VALUES (NULL, 'email', ${email}, true)`
      const res = await submitSuggestion({
        type: 'update',
        reporter_email: email,
        people_group_id: testGroupId,
        suggested_changes: changes
      })
      return res.id
    }

    it('requires both approvals before apply, then applies the changes', async () => {
      const id = await createPendingUpdate({ population: 5555 })

      // Non-approver cannot approve
      const forbidden = await $fetch(`/api/admin/people-group-reports/${id}/approve`, {
        method: 'POST', body: {}, ...otherAdmin.auth
      }).catch((e) => e)
      expect(forbidden.statusCode).toBe(403)

      // First approval
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      let report = await getReport(id)
      expect(report!.status).toBe('pending')
      expect(report!.approvals).toHaveLength(1)

      // Repeat approval by the same user does not double-count
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      report = await getReport(id)
      expect(report!.approvals).toHaveLength(1)

      // Apply before both approvals is rejected
      const early = await $fetch(`/api/admin/people-group-reports/${id}/accept`, {
        method: 'POST', body: {}, ...approver1.auth
      }).catch((e) => e)
      expect(early.statusCode).toBe(400)

      // Second approval flips to approved
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver2.auth })
      report = await getReport(id)
      expect(report!.status).toBe('approved')

      // Non-approver admin cannot apply a public suggestion
      const applyForbidden = await $fetch(`/api/admin/people-group-reports/${id}/accept`, {
        method: 'POST', body: {}, ...otherAdmin.auth
      }).catch((e) => e)
      expect(applyForbidden.statusCode).toBe(403)

      // Approver applies
      await $fetch(`/api/admin/people-group-reports/${id}/accept`, { method: 'POST', body: {}, ...approver1.auth })
      report = await getReport(id)
      expect(report!.status).toBe('accepted')

      const [group] = await sql`SELECT population FROM people_groups WHERE id = ${testGroupId}`
      expect(Number(group!.population)).toBe(5555)
    })

    it('sets reason_engaged to doxa_report when an engagement suggestion is applied', async () => {
      // The criteria booleans arrive as 'true'/'false' strings from the form
      // selects and are coerced to real booleans by the API.
      const id = await createPendingUpdate({ engagement_status: 'engaged', workers_long_term: 'true', imb_bible_available: 'false' })
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver2.auth })
      await $fetch(`/api/admin/people-group-reports/${id}/accept`, { method: 'POST', body: {}, ...approver2.auth })

      const [group] = await sql`SELECT engagement_status, metadata FROM people_groups WHERE id = ${testGroupId}`
      expect(group!.engagement_status).toBe('engaged')
      expect(group!.metadata?.reason_engaged).toBe('doxa_report')
      expect(group!.metadata?.workers_long_term).toBe(true)
      expect(group!.metadata?.imb_bible_available).toBe(false)

      // Reset for later tests
      await sql`UPDATE people_groups SET engagement_status = 'unengaged' WHERE id = ${testGroupId}`
    })

    it('either approver can deny unilaterally, leaving submitter comments untouched', async () => {
      const email = testEmail()
      await sql`INSERT INTO contact_methods (subscriber_id, type, value, verified) VALUES (NULL, 'email', ${email}, true)`
      const res = await submitSuggestion({
        type: 'update',
        reporter_email: email,
        people_group_id: testGroupId,
        comments: 'My original context',
        suggested_changes: { population: 6666 }
      })
      const id = res.id

      const forbidden = await $fetch(`/api/admin/people-group-reports/${id}/deny`, {
        method: 'POST', body: {}, ...otherAdmin.auth
      }).catch((e) => e)
      expect(forbidden.statusCode).toBe(403)

      await $fetch(`/api/admin/people-group-reports/${id}/deny`, {
        method: 'POST', body: {}, ...approver2.auth
      })
      const report = await getReport(id)
      expect(report!.status).toBe('denied')
      expect(report!.notes).toBe('My original context')
    })
  })

  describe('add and remove apply', () => {
    it('applies an approved add by creating a people group', async () => {
      const email = testEmail()
      await sql`INSERT INTO contact_methods (subscriber_id, type, value, verified) VALUES (NULL, 'email', ${email}, true)`
      const res = await submitSuggestion({
        type: 'add',
        reporter_email: email,
        comments: 'Met this group on a survey trip',
        suggested_changes: {
          name: 'Test Added Group',
          country_code: 'NPL',
          population: 750,
          imb_peid: 'TESTPEID001'
        }
      })

      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver2.auth })
      await $fetch(`/api/admin/people-group-reports/${res.id}/accept`, { method: 'POST', body: {}, ...approver1.auth })

      const report = await getReport(res.id)
      expect(report!.status).toBe('accepted')
      expect(report!.people_group_id).not.toBeNull()

      const [group] = await sql`SELECT * FROM people_groups WHERE id = ${report!.people_group_id}`
      expect(group!.name).toBe('Test Added Group')
      expect(group!.slug).toMatch(/^test-added-group/)
      expect(group!.country_code).toBe('NPL')
      expect(Number(group!.population)).toBe(750)
      expect(group!.metadata?.imb_peid).toBe('TESTPEID001')
      expect(group!.status).toBe('active')
    })

    it('applies an approved remove by archiving with the reason', async () => {
      const [removable] = await sql`
        INSERT INTO people_groups (name, slug, status, engagement_status)
        VALUES ('Test Removable Group', ${'test-removable-' + uuidv4().slice(0, 8)}, 'active', 'unengaged')
        RETURNING id
      `
      const email = testEmail()
      await sql`INSERT INTO contact_methods (subscriber_id, type, value, verified) VALUES (NULL, 'email', ${email}, true)`
      const res = await submitSuggestion({
        type: 'remove',
        reporter_email: email,
        comments: 'Could not find them at the last known location',
        people_group_id: removable!.id,
        suggested_changes: { reason_unlisted: 'no_longer_exists', population: 0 }
      })

      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver2.auth })
      await $fetch(`/api/admin/people-group-reports/${res.id}/accept`, { method: 'POST', body: {}, ...approver2.auth })

      const [group] = await sql`SELECT status, metadata FROM people_groups WHERE id = ${removable!.id}`
      expect(group!.status).toBe('archived')
      expect(group!.metadata?.reason_unlisted).toBe('no_longer_exists')
    })
  })

  describe('admin fast path (regression)', () => {
    it('admin-created reports still apply on a single accept', async () => {
      const created = await $fetch<{ report: { id: number } }>('/api/admin/people-group-reports', {
        method: 'POST',
        body: {
          people_group_id: testGroupId,
          reporter_name: 'Test Admin Reporter',
          suggested_changes: { population: 7777 }
        },
        ...otherAdmin.auth
      })

      const report = await getReport(created.report.id)
      expect(report!.source).toBe('admin')
      expect(report!.status).toBe('pending')

      await $fetch(`/api/admin/people-group-reports/${created.report.id}/accept`, {
        method: 'POST', body: {}, ...otherAdmin.auth
      })

      const accepted = await getReport(created.report.id)
      expect(accepted!.status).toBe('accepted')
      const [group] = await sql`SELECT population FROM people_groups WHERE id = ${testGroupId}`
      expect(Number(group!.population)).toBe(7777)
    })
  })

  describe('approver configuration', () => {
    it('lists the configured approvers', async () => {
      const res = await $fetch<{ approvers: { id: string }[] }>('/api/admin/people-group-reports/approvers', otherAdmin.auth)
      expect(res.approvers.map((a) => a.id).sort()).toEqual([approver1.user.id, approver2.user.id].sort())
    })

    it('rejects setting anything but two distinct existing users', async () => {
      const one = await $fetch('/api/admin/people-group-reports/approvers', {
        method: 'PUT', body: { approvers: [approver1.user.id] }, ...otherAdmin.auth
      }).catch((e) => e)
      expect(one.statusCode).toBe(400)

      const dup = await $fetch('/api/admin/people-group-reports/approvers', {
        method: 'PUT', body: { approvers: [approver1.user.id, approver1.user.id] }, ...otherAdmin.auth
      }).catch((e) => e)
      expect(dup.statusCode).toBe(400)

      const unknown = await $fetch('/api/admin/people-group-reports/approvers', {
        method: 'PUT', body: { approvers: [approver1.user.id, uuidv4()] }, ...otherAdmin.auth
      }).catch((e) => e)
      expect(unknown.statusCode).toBe(400)
    })
  })

  describe('search endpoints', () => {
    it('searches doxa groups publicly', async () => {
      const res = await $fetch<{ results: { id: number; name: string }[] }>('/api/updates/search-doxa', {
        query: { q: 'Test Suggestion Group' }
      })
      expect(res.results.some((r) => r.id === testGroupId)).toBe(true)
    })

    it('searches the IMB mirror with prefill and in_doxa flag', async () => {
      await sql`
        INSERT INTO imb_people_groups (peid, name, country, country_code, population, primary_religion, primary_language, engagement_status, gsec, raw)
        VALUES ('TESTPEID900', 'Test Mirror People', 'Nepal', 'NPL', 1234, 'ISU', 'nep', 'unengaged', 1, '{}')
        ON CONFLICT (peid) DO NOTHING
      `
      const res = await $fetch<{ results: any[] }>('/api/updates/search-external', {
        query: { q: 'Test Mirror People' }
      })
      const imbResult = res.results.find((r) => r.source === 'imb' && r.external_id === 'TESTPEID900')
      expect(imbResult).toBeDefined()
      expect(imbResult.prefill.population).toBe(1234)
      expect(imbResult.prefill.country_code).toBe('NPL')
      expect(imbResult.in_doxa).toBe(false)
      expect(imbResult.identifiers.imb_peid).toBe('TESTPEID900')
      expect(imbResult.doxa_exclusion_reasons).toEqual([])
    })

    it('reports why an IMB group fails the DOXA filter', async () => {
      await sql`
        INSERT INTO imb_people_groups (peid, name, country, country_code, population, primary_religion, primary_language, engagement_status, gsec, is_diaspora, raw)
        VALUES ('TESTPEID901', 'Test Excluded People', 'Nepal', 'NPL', 500, 'CRC', 'nep', 'engaged', 3, true, '{}')
        ON CONFLICT (peid) DO NOTHING
      `
      const res = await $fetch<{ results: any[] }>('/api/updates/search-external', {
        query: { q: 'Test Excluded People' }
      })
      const imbResult = res.results.find((r) => r.source === 'imb' && r.external_id === 'TESTPEID901')
      expect(imbResult.doxa_exclusion_reasons.sort()).toEqual(['christian_religion', 'diaspora', 'engaged', 'gsec_above_2'])
    })

    it('returns limited current values for a doxa group', async () => {
      const res = await $fetch<{ current_values: Record<string, any> }>(`/api/updates/doxa-group/${testGroupId}`)
      expect(res.current_values).toHaveProperty('population')
      expect(res.current_values).not.toHaveProperty('people_praying')
    })

    it('resolves a doxa group by slug', async () => {
      const byId = await $fetch<{ id: number; slug: string }>(`/api/updates/doxa-group/${testGroupId}`)
      const bySlug = await $fetch<{ id: number }>(`/api/updates/doxa-group/${byId.slug}`)
      expect(bySlug.id).toBe(testGroupId)
    })
  })
})
