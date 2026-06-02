import { describe, it, expect, afterAll, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber
} from '../../../helpers/db'
import { createAdminUser, createNoRoleUser } from '../../../helpers/auth'

const sql = getTestDatabase()
const SURVEY_KEY = 'may-2026-survey'

async function submitResponse(profileId: string) {
  return $fetch('/api/survey/response', {
    method: 'POST',
    body: {
      id: profileId,
      answers: { frequency: 3, focus: 4, clarity: 5, balance: 3, experience: 'Loved it', improvement: 'More Scripture' }
    }
  })
}

afterEach(async () => {
  await cleanupTestData(sql)
})

afterAll(async () => {
  await closeTestDatabase()
})

describe('Admin survey responses — list & delete', () => {
  it('lists individual responses with ids for an admin', async () => {
    const { auth } = await createAdminUser(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Survey List' })
    await submitResponse(subscriber.profile_id)

    const { responses } = await $fetch(`/api/admin/surveys/${SURVEY_KEY}/responses`, auth)
    expect(Array.isArray(responses)).toBe(true)
    const mine = responses.find((r: any) => r.profile_id === subscriber.profile_id)
    expect(mine).toBeTruthy()
    expect(typeof mine.id).toBe('number')
    expect(mine.subscriber_name).toBe('Test Survey List')
    expect(mine.answers.frequency).toBe(3)
    expect(mine.answers.experience).toBe('Loved it')
  })

  it('deletes a response and cascade-removes its answers', async () => {
    const { auth } = await createAdminUser(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Survey Delete' })
    await submitResponse(subscriber.profile_id)

    const { responses } = await $fetch(`/api/admin/surveys/${SURVEY_KEY}/responses`, auth)
    const target = responses.find((r: any) => r.profile_id === subscriber.profile_id)
    expect(target).toBeTruthy()

    const result = await $fetch(`/api/admin/surveys/${SURVEY_KEY}/responses/${target.id}`, {
      method: 'DELETE',
      ...auth
    })
    expect(result.success).toBe(true)

    const rows = await sql`SELECT id FROM survey_responses WHERE id = ${target.id}`
    expect(rows.length).toBe(0)
    const answers = await sql`SELECT id FROM survey_answers WHERE response_id = ${target.id}`
    expect(answers.length).toBe(0)
  })

  it('returns 404 when deleting a non-existent response', async () => {
    const { auth } = await createAdminUser(sql)
    const error = await $fetch(`/api/admin/surveys/${SURVEY_KEY}/responses/999999999`, {
      method: 'DELETE',
      ...auth
    }).catch(e => e)
    expect(error.statusCode).toBe(404)
  })

  it('forbids a user without marketing permission', async () => {
    const { auth: adminAuth } = await createAdminUser(sql)
    const { auth: noRoleAuth } = await createNoRoleUser(sql)
    const subscriber = await createTestSubscriber(sql, { name: 'Test Survey Forbidden' })
    await submitResponse(subscriber.profile_id)

    // Listing is gated on marketing.view
    const listErr = await $fetch(`/api/admin/surveys/${SURVEY_KEY}/responses`, noRoleAuth).catch(e => e)
    expect(listErr.statusCode).toBe(403)

    // Resolve a real id as admin, then attempt the delete as the no-role user
    const { responses } = await $fetch(`/api/admin/surveys/${SURVEY_KEY}/responses`, adminAuth)
    const target = responses.find((r: any) => r.profile_id === subscriber.profile_id)
    const delErr = await $fetch(`/api/admin/surveys/${SURVEY_KEY}/responses/${target.id}`, {
      method: 'DELETE',
      ...noRoleAuth
    }).catch(e => e)
    expect(delErr.statusCode).toBe(403)

    // The response must still exist
    const rows = await sql`SELECT id FROM survey_responses WHERE id = ${target.id}`
    expect(rows.length).toBe(1)
  })
})
