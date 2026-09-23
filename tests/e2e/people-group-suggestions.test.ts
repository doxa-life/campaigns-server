import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../helpers/db'
import { createAdminUser, createNoRoleUser, type TestUser, type AuthHeaders } from '../helpers/auth'

// Public /updates suggestion flow: submission + email verification,
// two-approver review, apply per type, and the admin fast-path regression.
describe('People Group Suggestions (/updates)', async () => {
  const sql = getTestDatabase()

  let approver1: { user: TestUser; auth: AuthHeaders }
  let approver2: { user: TestUser; auth: AuthHeaders }
  let otherAdmin: { user: TestUser; auth: AuthHeaders }
  let noRoleUser: { user: TestUser; auth: AuthHeaders }
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

  // The fields an "add" needs before it can be approved. Normally proposed by
  // the autofill job; the tests set them the way a reviewer would.
  async function saveAddFields(id: number, values: Record<string, any>, auth: AuthHeaders) {
    return await $fetch<{ report: any }>(`/api/admin/people-group-reports/${id}`, {
      method: 'PUT',
      body: { add_fields: { values } },
      ...auth
    })
  }

  const COMPLETE_ADD_FIELDS = {
    doxa_wagf_region: 'asia',
    doxa_wagf_block: 'south_asia',
    imb_reg_of_people_1: 'A012',
    primary_religion: 'MSN'
  }

  async function submitSuggestion(body: Record<string, any>) {
    return await $fetch<{ id: number; status: string }>('/api/updates', {
      method: 'POST',
      headers: ipHeaders(),
      body: {
        reporter_name: 'Test Reporter',
        reporter_email: testEmail(),
        verifier_name: 'Test Verifier',
        verifier_email: 'test-verifier@example.com',
        ...body
      }
    })
  }

  beforeAll(async () => {
    await cleanupTestData(sql)

    approver1 = await createAdminUser(sql)
    approver2 = await createAdminUser(sql)
    otherAdmin = await createAdminUser(sql)
    noRoleUser = await createNoRoleUser(sql)

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
    await sql`DELETE FROM app_config WHERE key IN ('people_group_report_approvers', 'people_group_report_notify_emails')`
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

    it('requires an independent verifier', async () => {
      const noVerifier = await submitSuggestion({
        type: 'update',
        verifier_name: '',
        people_group_id: testGroupId,
        suggested_changes: { population: 5 }
      }).catch((e) => e)
      expect(noVerifier.statusCode).toBe(400)

      const badVerifierEmail = await submitSuggestion({
        type: 'update',
        verifier_email: 'not-an-email',
        people_group_id: testGroupId,
        suggested_changes: { population: 5 }
      }).catch((e) => e)
      expect(badVerifierEmail.statusCode).toBe(400)

      const email = testEmail()
      const selfVerified = await submitSuggestion({
        type: 'update',
        reporter_email: email,
        verifier_email: email,
        people_group_id: testGroupId,
        suggested_changes: { population: 5 }
      }).catch((e) => e)
      expect(selfVerified.statusCode).toBe(400)
    })

    it('rejects adding an engaged people group', async () => {
      const engaged = await submitSuggestion({
        type: 'add',
        comments: 'Please add this group',
        suggested_changes: { name: 'Test Engaged Add Group', engagement_status: 'engaged' }
      }).catch((e) => e)
      expect(engaged.statusCode).toBe(400)
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

    // The form shows each field's current value beside a blank input, so
    // submitters re-enter values that are already on file.
    describe('values matching the record', () => {
      let confirmGroupId: number

      beforeAll(async () => {
        const [group] = await sql`
          INSERT INTO people_groups (name, slug, population, status, engagement_status, metadata)
          VALUES (
            'Test Confirmation Group',
            ${'test-confirmation-group-' + uuidv4().slice(0, 8)},
            1000,
            'active',
            'unengaged',
            ${sql.json({ imb_bible_available: true })}
          )
          RETURNING id
        `
        confirmGroupId = group!.id
      })

      it('keeps only the fields that differ', async () => {
        const res = await submitSuggestion({
          type: 'update',
          people_group_id: confirmGroupId,
          suggested_changes: {
            engagement_status: 'unengaged',
            imb_bible_available: true,
            population: 5000
          }
        })

        const report = await getReport(res.id)
        expect(report!.suggested_changes).toEqual({ population: 5000 })
      })

      it('rejects an update where nothing differs', async () => {
        const error = await submitSuggestion({
          type: 'update',
          people_group_id: confirmGroupId,
          suggested_changes: { engagement_status: 'unengaged', population: 1000 }
        }).catch((e) => e)
        expect(error.statusCode).toBe(400)
      })

      it('accepts a comment alongside values that all match', async () => {
        const res = await submitSuggestion({
          type: 'update',
          people_group_id: confirmGroupId,
          comments: 'Checked with our field team — all still correct.',
          suggested_changes: { population: 1000 }
        })

        const report = await getReport(res.id)
        expect(report!.suggested_changes).toEqual({})
        expect(report!.notes).toBe('Checked with our field team — all still correct.')
      })

      it('keeps the removal reason when the corrections all match', async () => {
        const res = await submitSuggestion({
          type: 'remove',
          people_group_id: confirmGroupId,
          comments: 'This is a diaspora community.',
          suggested_changes: { reason_unlisted: 'is_diaspora', population: 1000 }
        })

        const report = await getReport(res.id)
        expect(report!.suggested_changes).toEqual({ reason_unlisted: 'is_diaspora' })
      })
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

    it('requires both approvals, and the second one applies the changes', async () => {
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

      // Applying needs edit rights
      const applyForbidden = await $fetch(`/api/admin/people-group-reports/${id}/accept`, {
        method: 'POST', body: {}, ...noRoleUser.auth
      }).catch((e) => e)
      expect(applyForbidden.statusCode).toBe(403)

      // The second approval is the decision: it applies in the same request
      const second = await $fetch<{ applied?: boolean }>(`/api/admin/people-group-reports/${id}/approve`, {
        method: 'POST', body: {}, ...approver2.auth
      })
      expect(second.applied).toBe(true)
      report = await getReport(id)
      expect(report!.status).toBe('accepted')

      const [group] = await sql`SELECT population FROM people_groups WHERE id = ${testGroupId}`
      expect(Number(group!.population)).toBe(5555)
    })

    it('keeps the approval when applying on the final approval fails', async () => {
      const id = await createPendingUpdate({ population: 7777 })
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver1.auth })

      // An unlinked update cannot be applied, so the apply half fails.
      await sql`UPDATE people_group_reports SET people_group_id = NULL WHERE id = ${id}`

      const second = await $fetch<{ applied?: boolean; apply_error?: string }>(
        `/api/admin/people-group-reports/${id}/approve`,
        { method: 'POST', body: {}, ...approver2.auth }
      )
      expect(second.applied).toBe(false)
      expect(second.apply_error).toContain('Link this report')

      // Both approvals stand and the report waits at 'approved' for a manual apply.
      const report = await getReport(id)
      expect(report!.status).toBe('approved')
      expect(report!.approvals).toHaveLength(2)
    })

    it('sets reason_engaged to doxa_report when an engagement suggestion is applied', async () => {
      // The criteria booleans arrive as 'true'/'false' strings from the form
      // selects and are coerced to real booleans by the API.
      const id = await createPendingUpdate({ engagement_status: 'engaged', workers_long_term: 'true', imb_bible_available: 'false' })
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      await $fetch(`/api/admin/people-group-reports/${id}/approve`, { method: 'POST', body: {}, ...approver2.auth })

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

      // An add cannot be approved until its completion fields are filled in.
      const tooEarly = await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, {
        method: 'POST', body: {}, ...approver1.auth
      }).catch((e) => e)
      expect(tooEarly.statusCode).toBe(400)
      expect((await getReport(res.id))!.approvals).toHaveLength(0)

      // A partial set is no better than none.
      await saveAddFields(res.id, { doxa_wagf_region: 'asia' }, approver1.auth)
      const stillIncomplete = await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, {
        method: 'POST', body: {}, ...approver1.auth
      }).catch((e) => e)
      expect(stillIncomplete.statusCode).toBe(400)

      await saveAddFields(res.id, COMPLETE_ADD_FIELDS, approver1.auth)
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver2.auth })

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
      expect(group!.primary_religion).toBe('MSN')
      expect(group!.metadata?.doxa_wagf_region).toBe('asia')
      expect(group!.metadata?.doxa_wagf_block).toBe('south_asia')
      expect(group!.metadata?.imb_reg_of_people_1).toBe('A012')
      // No photo: the region placeholder, flagged as such for the public API.
      expect(group!.image_url).toBe('https://s3.doxa.life/no-photo-images/asia.jpg')
      expect(group!.metadata?.imb_has_photo).toBe(false)
      expect(group!.random_order).not.toBeNull()
      expect(group!.descriptions).toBeNull()
      expect(group!.tags).toEqual([
        'needs:qr-code',
        'needs:printable-prayer-card',
        'needs:promo-slide',
        'needs:social-share-image'
      ])
    })

    it('stores the description phrase, queues its translation, and uses the deaf placeholder', async () => {
      const email = testEmail()
      await sql`INSERT INTO contact_methods (subscriber_id, type, value, verified) VALUES (NULL, 'email', ${email}, true)`
      const res = await submitSuggestion({
        type: 'add',
        reporter_email: email,
        comments: 'Deaf community survey',
        suggested_changes: { name: 'Test Deaf Added Group', country_code: 'NGA', population: 12000 }
      })
      await saveAddFields(res.id, {
        doxa_wagf_region: 'africa',
        doxa_wagf_block: 'west_africa',
        imb_reg_of_people_1: 'A017',
        primary_religion: 'MSN',
        description_en: 'a Deaf community of Nigeria',
        imb_alternate_name: 'Nigerian Deaf'
      }, approver1.auth)
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver2.auth })

      const report = await getReport(res.id)
      const [group] = await sql`SELECT * FROM people_groups WHERE id = ${report!.people_group_id}`
      expect(group!.image_url).toBe('https://s3.doxa.life/no-photo-images/deaf-africa.jpg')
      expect(group!.descriptions).toEqual({ en: 'a Deaf community of Nigeria' })
      expect(group!.metadata?.imb_alternate_name).toBe('Nigerian Deaf')

      const [job] = await sql`
        SELECT * FROM jobs
        WHERE type = 'people_group_translation' AND reference_type = 'people_group' AND reference_id = ${group!.id}
      `
      expect(job).toBeDefined()
      expect(job!.payload.people_group_id).toBe(group!.id)
      expect(job!.payload.field_key).toBe('descriptions')
    })

    it("auto-populates an add from the IMB mirror row and the country's other groups", async () => {
      await sql`
        INSERT INTO people_groups (name, slug, country_code, region, status, engagement_status, metadata)
        VALUES (
          'Test Country Peer', ${'test-country-peer-' + uuidv4().slice(0, 8)}, 'BTN', 'asia', 'active', 'unengaged',
          ${sql.json({ doxa_wagf_region: 'asia', doxa_wagf_block: 'south_asia', doxa_wagf_member: 'yes', imb_subregion: 'Southern Asia' })}
        )
      `
      await sql`
        INSERT INTO imb_people_groups (peid, name, country, country_code, region, subregion, population, primary_religion, primary_language, engagement_status, gsec, is_diaspora, photo_url, raw)
        VALUES ('TESTPEID902', 'Test Mirror Added', 'Bhutan', 'BTN', 'asia', 'Southern Asia', 4321, 'H', 'dzo', 'unengaged', 1, false, NULL, ${sql.json({
          ROP1Code: 'A012',
          ROP2Code: 'C0155',
          GSEC: '1',
          AlternateNames: 'Mirror Folk, Test Folk',
          Description: 'a hill community of Bhutan',
          LocationDescription: 'Karnali province',
          EvangelicalLevel: '5% or Greater but Less than 10%',
          CongregationsExist: 'Yes',
          ChurchPlantingWithinLast2Years: 'Dispersed Church Planting',
          BibleAvailability: 'Available',
          JesusFilmAvailability: 'Not Available',
          HasPhoto: 'N',
          Indigenous: 'Indigenous',
          PhotoCredit: '<div style="font-size: 0.8em">No photo available</div>'
        })})
        ON CONFLICT (peid) DO NOTHING
      `
      const email = testEmail()
      await sql`INSERT INTO contact_methods (subscriber_id, type, value, verified) VALUES (NULL, 'email', ${email}, true)`
      const res = await submitSuggestion({
        type: 'add',
        reporter_email: email,
        comments: 'From the IMB list',
        suggested_changes: { name: 'Test Mirror Added', country_code: 'BTN', population: 4321, imb_peid: 'TESTPEID902' }
      })

      const proposal = await $fetch<{ source: string }>(
        `/api/admin/people-group-reports/${res.id}/auto-populate`,
        { method: 'POST', body: {}, ...otherAdmin.auth }
      )
      expect(proposal.source).toBe('imb')

      // The proposal is saved on the report, not handed back for the browser to hold.
      const stored = (await getReport(res.id))!.add_fields
      expect(stored.source).toBe('imb')
      expect(stored.generated_at).toBeTruthy()
      expect(stored.values.imb_reg_of_people_1).toBe('A012')
      expect(stored.values.primary_religion).toBe('H')
      expect(stored.values.region).toBe('asia')
      expect(stored.values.imb_subregion).toBe('southern_asia')
      expect(stored.values.imb_alternate_name).toBe('Mirror Folk, Test Folk')
      expect(stored.values.description_en).toBe('a hill community of Bhutan')
      expect(stored.values.picture_credit).toBeUndefined()
      expect(stored.values.doxa_wagf_region).toBe('asia')
      expect(stored.values.doxa_wagf_block).toBe('south_asia')
      expect(stored.values.doxa_wagf_member).toBeUndefined()
      expect(stored.ai.primary_religion).toBe('H')
      expect(stored.metadata.imb_reg_of_people_2).toBe('C0155')
      expect(stored.metadata.imb_evangelical_level).toBe('3')
      expect(stored.metadata.imb_congregation_existing).toBe('1')
      expect(stored.metadata.imb_church_planting).toBe('1')
      expect(stored.metadata.imb_bible_available).toBe(true)
      expect(stored.metadata.imb_jesus_film_available).toBe(false)
      expect(stored.metadata.imb_location_description).toBe('Karnali province')
      expect(stored.metadata.imb_is_indigenous).toBe('1')

      // A reviewer's correction survives a regenerate; untouched values do not.
      await saveAddFields(res.id, { ...stored.values, primary_religion: 'MSN' }, approver1.auth)
      await $fetch(`/api/admin/people-group-reports/${res.id}/auto-populate`, {
        method: 'POST', body: {}, ...otherAdmin.auth
      })
      const regenerated = (await getReport(res.id))!.add_fields
      expect(regenerated.values.primary_religion).toBe('MSN')
      expect(regenerated.values.imb_reg_of_people_1).toBe('A012')

      // Applying uses the stored fields and the stored IMB detail metadata.
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver1.auth })
      await $fetch(`/api/admin/people-group-reports/${res.id}/approve`, { method: 'POST', body: {}, ...approver2.auth })
      const applied = await getReport(res.id)
      expect(applied!.status).toBe('accepted')
      const [group] = await sql`SELECT * FROM people_groups WHERE id = ${applied!.people_group_id}`
      expect(group!.primary_religion).toBe('MSN')
      expect(group!.metadata?.imb_reg_of_people_2).toBe('C0155')
      expect(group!.metadata?.imb_location_description).toBe('Karnali province')
      expect(group!.descriptions).toEqual({ en: 'a hill community of Bhutan' })
    })

    it('queues the completion-field proposal when the reporter verifies their email', async () => {
      const email = testEmail()
      const res = await submitSuggestion({
        type: 'add',
        reporter_email: email,
        comments: 'Found them on a survey trip',
        suggested_changes: { name: 'Test Autofill Queued', country_code: 'NPL', population: 400 }
      })
      expect((await getReport(res.id))!.status).toBe('awaiting_verification')

      // Nothing is proposed while the reporter is unverified.
      const before = await sql`
        SELECT * FROM jobs WHERE type = 'add_report_autofill' AND reference_id = ${res.id}
      `
      expect(before).toHaveLength(0)

      const [contact] = await sql`SELECT verification_token FROM contact_methods WHERE LOWER(value) = ${email}`
      await rawFetch(`/api/updates/verify?token=${contact!.verification_token}`, { redirect: 'manual' })

      expect((await getReport(res.id))!.status).toBe('pending')
      const [job] = await sql`
        SELECT * FROM jobs WHERE type = 'add_report_autofill' AND reference_id = ${res.id}
      `
      expect(job).toBeDefined()
      expect(job!.reference_type).toBe('people_group_report')
      expect(job!.payload.report_id).toBe(res.id)
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

    it('stores the extra notification addresses normalized and deduplicated', async () => {
      const approverIds = [approver1.user.id, approver2.user.id]
      const saved = await $fetch<{ notify_emails: string[] }>('/api/admin/people-group-reports/approvers', {
        method: 'PUT',
        body: { approvers: approverIds, notify_emails: [' Third@Example.org ', 'third@example.org', 'fourth@example.org', ''] },
        ...otherAdmin.auth
      })
      expect(saved.notify_emails).toEqual(['third@example.org', 'fourth@example.org'])

      const listed = await $fetch<{ notify_emails: string[] }>('/api/admin/people-group-reports/approvers', otherAdmin.auth)
      expect(listed.notify_emails).toEqual(['third@example.org', 'fourth@example.org'])

      // Saving the approvers alone leaves the addresses as they are.
      await $fetch('/api/admin/people-group-reports/approvers', {
        method: 'PUT', body: { approvers: approverIds }, ...otherAdmin.auth
      })
      const unchanged = await $fetch<{ notify_emails: string[] }>('/api/admin/people-group-reports/approvers', otherAdmin.auth)
      expect(unchanged.notify_emails).toEqual(['third@example.org', 'fourth@example.org'])

      // An empty list clears them.
      await $fetch('/api/admin/people-group-reports/approvers', {
        method: 'PUT', body: { approvers: approverIds, notify_emails: [] }, ...otherAdmin.auth
      })
      const cleared = await $fetch<{ notify_emails: string[] }>('/api/admin/people-group-reports/approvers', otherAdmin.auth)
      expect(cleared.notify_emails).toEqual([])
    })

    it('rejects a malformed notification address', async () => {
      const bad = await $fetch('/api/admin/people-group-reports/approvers', {
        method: 'PUT',
        body: { approvers: [approver1.user.id, approver2.user.id], notify_emails: ['not-an-email'] },
        ...otherAdmin.auth
      }).catch((e) => e)
      expect(bad.statusCode).toBe(400)
    })
  })

  describe('search endpoints', () => {
    it('searches doxa groups publicly', async () => {
      const res = await $fetch<{ results: { id: number; name: string }[] }>('/api/updates/search-doxa', {
        query: { q: 'Test Suggestion Group' }
      })
      expect(res.results.some((r) => r.id === testGroupId)).toBe(true)
    })

    it('matches doxa groups by IMB alternate name', async () => {
      await sql`
        UPDATE people_groups
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{imb_alternate_name}', '"Test Alias People"')
        WHERE id = ${testGroupId}
      `
      const res = await $fetch<{ results: { id: number; alternate_name: string | null }[] }>('/api/updates/search-doxa', {
        query: { q: 'Test Alias People' }
      })
      const hit = res.results.find((r) => r.id === testGroupId)
      expect(hit).toBeDefined()
      expect(hit!.alternate_name).toBe('Test Alias People')
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
