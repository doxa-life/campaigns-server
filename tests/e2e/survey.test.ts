import { describe, it, expect, afterAll, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestSubscriber
} from '../helpers/db'

const sql = getTestDatabase()

async function getSurveyResponse(subscriberId: number) {
  const [survey] = await sql`SELECT id FROM surveys WHERE key = 'may-2026-survey'`
  const [response] = await sql`
    SELECT id FROM survey_responses WHERE survey_id = ${survey!.id} AND subscriber_id = ${subscriberId}
  `
  if (!response) return null
  const answers = await sql`
    SELECT question_key, value_int, value_text FROM survey_answers WHERE response_id = ${response.id}
  `
  return { id: response.id, answers }
}

afterEach(async () => {
  await cleanupTestData(sql)
})

afterAll(async () => {
  await closeTestDatabase()
})

describe('GET /api/survey/response', () => {
  it('returns valid:false for a malformed id', async () => {
    const response = await $fetch('/api/survey/response?id=not-a-uuid')
    expect(response.valid).toBe(false)
  })

  it('returns valid:false for an unknown (but well-formed) profile id', async () => {
    const response = await $fetch('/api/survey/response?id=00000000-0000-4000-8000-000000000000')
    expect(response.valid).toBe(false)
  })

  it('returns valid:true with no prior answers for a known subscriber', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Survey Get' })

    const response = await $fetch(`/api/survey/response?id=${subscriber.profile_id}`)

    expect(response.valid).toBe(true)
    expect(response.alreadyResponded).toBe(false)
    expect(response.answers).toEqual({})
  })
})

describe('POST /api/survey/response', () => {
  it('rejects a malformed id', async () => {
    const error = await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: 'not-a-uuid', answers: {} }
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
  })

  it('rejects an out-of-range scale answer', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Survey Bad Scale' })

    const error = await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: subscriber.profile_id, answers: { focus: 9 } }
    }).catch(e => e)

    expect(error.statusCode).toBe(400)
  })

  it('stores scale and text answers', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Survey Submit' })

    const result = await $fetch('/api/survey/response', {
      method: 'POST',
      body: {
        id: subscriber.profile_id,
        answers: { focus: 4, clarity: 5, content_amount: 3, experience: 'Loved it', heart: 'Changed me' }
      }
    })
    expect(result.success).toBe(true)

    const stored = await getSurveyResponse(subscriber.id)
    expect(stored).not.toBeNull()
    const byKey = Object.fromEntries(stored!.answers.map((a: any) => [a.question_key, a]))
    expect(byKey.focus.value_int).toBe(4)
    expect(byKey.clarity.value_int).toBe(5)
    expect(byKey.experience.value_text).toBe('Loved it')

    // GET should now report alreadyResponded with the saved answers prefilled.
    const get = await $fetch(`/api/survey/response?id=${subscriber.profile_id}`)
    expect(get.alreadyResponded).toBe(true)
    expect(get.answers.focus).toBe(4)
    expect(get.answers.experience).toBe('Loved it')
  })

  it('overwrites a prior response on re-submit (keeps latest)', async () => {
    const subscriber = await createTestSubscriber(sql, { name: 'Test Survey Resubmit' })

    await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: subscriber.profile_id, answers: { focus: 2 } }
    })
    await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: subscriber.profile_id, answers: { focus: 5 } }
    })

    const stored = await getSurveyResponse(subscriber.id)
    const focus = stored!.answers.find((a: any) => a.question_key === 'focus')
    expect(focus.value_int).toBe(5)
    // Only one response row per subscriber.
    const responses = await sql`
      SELECT COUNT(*)::int as n FROM survey_responses WHERE subscriber_id = ${subscriber.id}
    `
    expect(responses[0]!.n).toBe(1)
  })
})

describe('Dynamic surveys', () => {
  const KEY = 'test-dynamic-survey'

  async function seedDynamicSurvey() {
    await sql`DELETE FROM surveys WHERE key = ${KEY}`
    const [survey] = await sql`
      INSERT INTO surveys (key, title, status) VALUES (${KEY}, 'Test Dynamic Survey', 'open') RETURNING id
    `
    await sql`
      INSERT INTO survey_questions (survey_id, key, type, position, config) VALUES
        (${survey!.id}, 'rating', 'scale', 0, ${sql.json({ min: 1, max: 3, scalePoints: [1, 3] })}),
        (${survey!.id}, 'note', 'text', 1, ${sql.json({})})
    `
    await sql`
      INSERT INTO survey_translations (survey_id, language_code, content) VALUES
        (${survey!.id}, 'en', ${sql.json({
          page: { title: 'Test Dynamic', intro: 'Intro' },
          questions: {
            rating: { label: 'Your rating', scale: { 1: 'Low', 3: 'High' } },
            note: { label: 'Any notes?' }
          },
          email: { subject: 'Test subject', cta: 'Open', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] } }
        })})
    `
    return survey!.id as number
  }

  afterEach(async () => {
    await sql`DELETE FROM surveys WHERE key = ${KEY}`
  })

  it('serves dynamic questions and translated labels for a known subscriber', async () => {
    await seedDynamicSurvey()
    const subscriber = await createTestSubscriber(sql, { name: 'Test Dyn Get' })

    const res = await $fetch(`/api/survey/response?id=${subscriber.profile_id}&key=${KEY}&lang=en`)

    expect(res.valid).toBe(true)
    expect(res.surveyExists).toBe(true)
    expect(res.status).toBe('open')
    expect(res.questions.map((q: any) => q.key)).toEqual(['rating', 'note'])
    expect(res.content.questions.rating.label).toBe('Your rating')
    expect(res.content.page.title).toBe('Test Dynamic')
  })

  it('validates and stores answers against the dynamic question config', async () => {
    await seedDynamicSurvey()
    const subscriber = await createTestSubscriber(sql, { name: 'Test Dyn Submit' })

    // rating max is 3 for this survey, so 5 is rejected.
    const bad = await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: subscriber.profile_id, key: KEY, answers: { rating: 5 } }
    }).catch(e => e)
    expect(bad.statusCode).toBe(400)

    const ok = await $fetch('/api/survey/response', {
      method: 'POST',
      body: { id: subscriber.profile_id, key: KEY, answers: { rating: 2, note: 'great' } }
    })
    expect(ok.success).toBe(true)

    const [survey] = await sql`SELECT id FROM surveys WHERE key = ${KEY}`
    const [response] = await sql`SELECT id FROM survey_responses WHERE survey_id = ${survey!.id} AND subscriber_id = ${subscriber.id}`
    const answers = await sql`SELECT question_key, value_int, value_text FROM survey_answers WHERE response_id = ${response!.id}`
    const byKey = Object.fromEntries(answers.map((a: any) => [a.question_key, a]))
    expect(byKey.rating.value_int).toBe(2)
    expect(byKey.note.value_text).toBe('great')
  })

  it('returns surveyExists:false for an unknown survey key', async () => {
    const res = await $fetch('/api/survey/response?id=00000000-0000-4000-8000-000000000000&key=nope-not-real')
    expect(res.surveyExists).toBe(false)
    expect(res.valid).toBe(false)
  })
})
