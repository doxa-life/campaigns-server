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

interface CountryCount {
  country: string
  name: string
  count: number
}

interface PrayerLocations {
  window: string
  countries: CountryCount[]
  located: number
  total: number
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
    options: { trackingId?: string | null; daysAgo?: number; country?: string | null } = {}
  ) {
    const timestamp = new Date(Date.now() - (options.daysAgo ?? 0) * 24 * 60 * 60 * 1000).toISOString()
    await sql`
      INSERT INTO prayer_activity (people_group_id, session_id, tracking_id, duration, timestamp, country)
      VALUES (${peopleGroupId}, ${`test-loc-${uuidv4()}`}, ${options.trackingId ?? null}, 60, ${timestamp}, ${options.country ?? null})
    `
  }

  function fetchLocations(window?: string) {
    return $fetch<PrayerLocations>('/api/admin/dashboard/prayer-locations', {
      ...adminAuth,
      query: window ? { window } : {}
    })
  }

  const countFor = (res: PrayerLocations, code: string) => res.countries.find(c => c.country === code)?.count ?? 0

  it('requires authentication', async () => {
    const error = await $fetch('/api/admin/dashboard/prayer-locations').catch(e => e)
    expect(error.statusCode).toBe(401)
  })

  it('counts distinct people per country', async () => {
    const pg = await createTestPeopleGroup(sql)
    const stamp = Date.now()
    // Bouvet Island: uninhabited, so no other row in the test DB can carry it.
    const country = 'BV'

    const before = await fetchLocations('all')

    await insertActivity(pg.id, { trackingId: `test-person-a-${stamp}`, country })
    await insertActivity(pg.id, { trackingId: `test-person-a-${stamp}`, country })
    await insertActivity(pg.id, { trackingId: `test-person-b-${stamp}`, country })
    await insertActivity(pg.id, { trackingId: null, country })
    await insertActivity(pg.id, { trackingId: `test-person-c-${stamp}`, country: null })

    const after = await fetchLocations('all')
    const entry = after.countries.find(c => c.country === country)

    expect(entry).toMatchObject({ country, name: 'Bouvet Island', count: countFor(before, country) + 3 })
    expect(after.located - before.located).toBe(3)
    expect(after.total - before.total).toBe(4)
  })

  it('limits counts to the requested window and defaults to 7 days', async () => {
    const pg = await createTestPeopleGroup(sql)
    const stamp = Date.now()
    // Heard Island and Antarctica: uninhabited, so these counts are ours alone.
    const recent = 'HM'
    const old = 'AQ'

    await insertActivity(pg.id, { trackingId: `test-recent-${stamp}`, country: recent })
    await insertActivity(pg.id, { trackingId: `test-old-${stamp}`, daysAgo: 10, country: old })

    const week = await fetchLocations()
    expect(week.window).toBe('7d')
    expect(countFor(week, recent)).toBe(1)
    expect(countFor(week, old)).toBe(0)

    const day = await fetchLocations('24h')
    expect(countFor(day, recent)).toBe(1)
    expect(countFor(day, old)).toBe(0)

    const month = await fetchLocations('30d')
    expect(countFor(month, recent)).toBe(1)
    expect(countFor(month, old)).toBe(1)

    const bogus = await fetchLocations('bogus')
    expect(bogus.window).toBe('7d')
  })

  it('orders countries by count, busiest first', async () => {
    const res = await fetchLocations('all')
    const counts = res.countries.map(c => c.count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })
})
