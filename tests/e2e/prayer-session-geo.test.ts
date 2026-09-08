import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup
} from '../helpers/db'

const NAIROBI = {
  'cf-ipcountry': 'KE',
  'cf-ipcity': 'Nairobi',
  'cf-iplatitude': '-1.2921',
  'cf-iplongitude': '36.8219'
}

describe('POST /api/people-groups/[slug]/prayer-content/[date]/session location capture', async () => {
  const sql = getTestDatabase()

  afterEach(async () => {
    await cleanupTestData(sql)
  })

  afterAll(async () => {
    await closeTestDatabase()
  })

  function saveSession(slug: string, sessionId: string, headers: Record<string, string> = {}, duration = 0) {
    return $fetch(`/api/people-groups/${slug}/prayer-content/2026-09-08/session`, {
      method: 'POST',
      headers,
      body: {
        session_id: sessionId,
        tracking_id: `tracking-${sessionId}`,
        duration,
        timestamp: new Date().toISOString()
      }
    })
  }

  async function rowFor(sessionId: string) {
    const [row] = await sql`
      SELECT latitude, longitude, city, country, duration
      FROM prayer_activity WHERE session_id = ${sessionId}
    `
    return row
  }

  it('stores the rounded Cloudflare location on the session row', async () => {
    const pg = await createTestPeopleGroup(sql)
    const sessionId = `test-geo-${Date.now()}`

    await saveSession(pg.slug, sessionId, NAIROBI)

    expect(await rowFor(sessionId)).toMatchObject({
      latitude: -1.3,
      longitude: 36.8,
      city: 'Nairobi',
      country: 'KE'
    })
  })

  it('keeps the first location when later saves of the same session carry none', async () => {
    const pg = await createTestPeopleGroup(sql)
    const sessionId = `test-geo-pinned-${Date.now()}`

    await saveSession(pg.slug, sessionId, NAIROBI)
    await saveSession(pg.slug, sessionId, {}, 60)

    expect(await rowFor(sessionId)).toMatchObject({
      latitude: -1.3,
      longitude: 36.8,
      city: 'Nairobi',
      country: 'KE',
      duration: 60
    })
  })

  it('leaves the location empty when the headers are absent', async () => {
    const pg = await createTestPeopleGroup(sql)
    const sessionId = `test-geo-none-${Date.now()}`

    await saveSession(pg.slug, sessionId)

    expect(await rowFor(sessionId)).toMatchObject({
      latitude: null,
      longitude: null,
      city: null,
      country: null
    })
  })

  it('drops an unknown country code but keeps the rest', async () => {
    const pg = await createTestPeopleGroup(sql)
    const sessionId = `test-geo-xx-${Date.now()}`

    await saveSession(pg.slug, sessionId, { ...NAIROBI, 'cf-ipcountry': 'XX' })

    expect(await rowFor(sessionId)).toMatchObject({
      latitude: -1.3,
      longitude: 36.8,
      city: 'Nairobi',
      country: null
    })
  })
})
