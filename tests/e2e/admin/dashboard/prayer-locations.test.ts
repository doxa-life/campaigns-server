import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { v4 as uuidv4 } from 'uuid'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup
} from '../../../helpers/db'
import { createAdminUser } from '../../../helpers/auth'

interface Point {
  latitude: number
  longitude: number
  city: string | null
  country: string | null
  label: string
  count: number
}

interface PrayerLocations {
  window: string
  points: Point[]
  located: number
  total: number
}

interface Geo {
  latitude: number
  longitude: number
  city: string
  country: string
}

describe('GET /api/admin/dashboard/prayer-locations', async () => {
  const sql = getTestDatabase()
  let adminAuth: { headers: { cookie: string } }

  beforeAll(async () => {
    await cleanupTestData(sql)
    adminAuth = (await createAdminUser(sql)).auth
  })

  afterAll(async () => {
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  async function insertActivity(
    peopleGroupId: number,
    options: { trackingId?: string | null; daysAgo?: number; geo?: Geo | null } = {}
  ) {
    const timestamp = new Date(Date.now() - (options.daysAgo ?? 0) * 24 * 60 * 60 * 1000).toISOString()
    const geo = options.geo ?? null
    await sql`
      INSERT INTO prayer_activity (people_group_id, session_id, tracking_id, duration, timestamp, latitude, longitude, city, country)
      VALUES (
        ${peopleGroupId}, ${`test-loc-${uuidv4()}`}, ${options.trackingId ?? null}, 60, ${timestamp},
        ${geo?.latitude ?? null}, ${geo?.longitude ?? null}, ${geo?.city ?? null}, ${geo?.country ?? null}
      )
    `
  }

  function fetchLocations(window?: string) {
    return $fetch<PrayerLocations>('/api/admin/dashboard/prayer-locations', {
      ...adminAuth,
      query: window ? { window } : {}
    })
  }

  it('requires authentication', async () => {
    const error = await $fetch('/api/admin/dashboard/prayer-locations').catch(e => e)
    expect(error.statusCode).toBe(401)
  })

  it('counts distinct people per location cell', async () => {
    const pg = await createTestPeopleGroup(sql)
    const stamp = Date.now()
    const city = `Test City ${stamp}`
    const geo = { latitude: 0.4, longitude: -0.4, city, country: 'KE' }

    const before = await fetchLocations('all')

    await insertActivity(pg.id, { trackingId: `test-person-a-${stamp}`, geo })
    await insertActivity(pg.id, { trackingId: `test-person-a-${stamp}`, geo })
    await insertActivity(pg.id, { trackingId: `test-person-b-${stamp}`, geo })
    await insertActivity(pg.id, { trackingId: null, geo })
    await insertActivity(pg.id, { trackingId: `test-person-c-${stamp}`, geo: null })

    const after = await fetchLocations('all')
    const point = after.points.find(p => p.city === city)

    expect(point).toMatchObject({
      latitude: 0.4,
      longitude: -0.4,
      country: 'KE',
      label: `${city}, Kenya`,
      count: 3
    })
    expect(after.located - before.located).toBe(3)
    expect(after.total - before.total).toBe(4)
  })

  it('limits points to the requested window and defaults to 7 days', async () => {
    const pg = await createTestPeopleGroup(sql)
    const stamp = Date.now()
    const recentCity = `Test Recent ${stamp}`
    const oldCity = `Test Old ${stamp}`

    await insertActivity(pg.id, {
      trackingId: `test-recent-${stamp}`,
      geo: { latitude: 10.1, longitude: 10.1, city: recentCity, country: 'US' }
    })
    await insertActivity(pg.id, {
      trackingId: `test-old-${stamp}`,
      daysAgo: 10,
      geo: { latitude: 20.2, longitude: 20.2, city: oldCity, country: 'US' }
    })

    const hasCity = (res: PrayerLocations, name: string) => res.points.some(p => p.city === name)

    const week = await fetchLocations()
    expect(week.window).toBe('7d')
    expect(hasCity(week, recentCity)).toBe(true)
    expect(hasCity(week, oldCity)).toBe(false)

    const day = await fetchLocations('24h')
    expect(hasCity(day, recentCity)).toBe(true)
    expect(hasCity(day, oldCity)).toBe(false)

    const month = await fetchLocations('30d')
    expect(hasCity(month, recentCity)).toBe(true)
    expect(hasCity(month, oldCity)).toBe(true)

    const bogus = await fetchLocations('bogus')
    expect(bogus.window).toBe('7d')
  })
})
