import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { url } from '@nuxt/test-utils/e2e'
import { chromium, type Browser } from 'playwright-core'
import {
  getTestDatabase,
  closeTestDatabase,
  cleanupTestData,
  createTestPeopleGroup,
  createTestLibrary,
  createTestLibraryContent,
} from '../helpers/db'

// Anchor day-number arithmetic: day 1 → 2026-04-30, day 2 → 2026-05-01, day 3 → 2026-05-02.
const ANCHOR_START_DATE = '2026-04-30'

const MARKERS = {
  day1: 'TZ_MARKER_2026_04_30',
  day2: 'TZ_MARKER_2026_05_01',
  day3: 'TZ_MARKER_2026_05_02',
}

const docWith = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe('prayer page in different browser timezones', () => {
  const sql = getTestDatabase()
  let browser: Browser
  let slug: string

  // Snapshot pre-existing global config so we can restore it after the test.
  let savedStartDate: string | undefined
  let savedLibraries: string | undefined

  beforeAll(async () => {
    browser = await chromium.launch()

    const cfgRows = await sql<{ key: string; value: string }[]>`
      SELECT key, value FROM app_config
      WHERE key IN ('global_campaign_start_date', 'global_campaign_libraries')
    `
    for (const row of cfgRows) {
      if (row.key === 'global_campaign_start_date') savedStartDate = row.value
      if (row.key === 'global_campaign_libraries') savedLibraries = row.value
    }

    await sql`
      INSERT INTO app_config (key, value)
      VALUES ('global_campaign_start_date', ${JSON.stringify(ANCHOR_START_DATE)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `

    const pg = await createTestPeopleGroup(sql, { title: 'Test TZ PG' })
    slug = pg.slug

    const lib = await createTestLibrary(sql, { name: `Test Library TZ ${Date.now()}` })

    await createTestLibraryContent(sql, lib.id, { day_number: 1, content_json: docWith(MARKERS.day1) })
    await createTestLibraryContent(sql, lib.id, { day_number: 2, content_json: docWith(MARKERS.day2) })
    await createTestLibraryContent(sql, lib.id, { day_number: 3, content_json: docWith(MARKERS.day3) })

    const librariesConfig = { rows: [{ rowIndex: 0, libraries: [{ libraryId: lib.id, order: 0 }] }] }
    await sql`
      INSERT INTO app_config (key, value)
      VALUES ('global_campaign_libraries', ${JSON.stringify(librariesConfig)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `
  }, 60000)

  afterAll(async () => {
    if (browser) await browser.close()

    if (savedStartDate !== undefined) {
      await sql`UPDATE app_config SET value = ${savedStartDate} WHERE key = 'global_campaign_start_date'`
    } else {
      await sql`DELETE FROM app_config WHERE key = 'global_campaign_start_date'`
    }
    if (savedLibraries !== undefined) {
      await sql`UPDATE app_config SET value = ${savedLibraries} WHERE key = 'global_campaign_libraries'`
    } else {
      await sql`DELETE FROM app_config WHERE key = 'global_campaign_libraries'`
    }

    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  async function openPrayerPage(timezoneId: string, frozenInstantIso: string) {
    const context = await browser.newContext({ timezoneId, locale: 'en-US' })
    const page = await context.newPage()
    await page.clock.install({ time: new Date(frozenInstantIso) })
    await page.goto(url(`/${slug}/prayer`))
    return { context, page }
  }

  async function assertDateAndMarker(
    timezoneId: string,
    frozenInstantIso: string,
    expectedDateText: string,
    expectedMarker: string,
  ) {
    const { context, page } = await openPrayerPage(timezoneId, frozenInstantIso)
    try {
      await page.locator(`text=${expectedMarker}`).waitFor({ state: 'visible', timeout: 15000 })
      const dateText = (await page.locator('header p.text-muted').first().innerText()).trim()
      expect(dateText).toBe(expectedDateText)
    } finally {
      await context.close()
    }
  }

  it('Los Angeles user (UTC has already ticked) sees their local previous-day date and content', async () => {
    // 2026-05-01T05:00:00Z → 2026-04-30T22:00 PDT (UTC-7)
    // Old code would have requested 2026-05-01 (UTC date) and shown content for day 2.
    // Fix: client computes 2026-04-30 from local getters → day 1 content.
    await assertDateAndMarker(
      'America/Los_Angeles',
      '2026-05-01T05:00:00Z',
      'Thursday, April 30, 2026',
      MARKERS.day1,
    )
  })

  it('Tokyo user at the same UTC instant sees their local (UTC-aligned) date and content', async () => {
    // 2026-05-01T05:00:00Z → 2026-05-01T14:00 JST (UTC+9). Local date matches UTC date.
    await assertDateAndMarker(
      'Asia/Tokyo',
      '2026-05-01T05:00:00Z',
      'Friday, May 1, 2026',
      MARKERS.day2,
    )
  })

  it('UTC user sees UTC-aligned date and content', async () => {
    await assertDateAndMarker(
      'UTC',
      '2026-05-01T05:00:00Z',
      'Friday, May 1, 2026',
      MARKERS.day2,
    )
  })

  it('Los Angeles late-evening user gets local-today content, not UTC-tomorrow', async () => {
    // 2026-05-02T04:00:00Z → 2026-05-01T21:00 PDT. UTC has ticked into 2026-05-02 but locally it's still 2026-05-01.
    // Old code would have requested 2026-05-02 → day 3. Fix: requests 2026-05-01 → day 2.
    await assertDateAndMarker(
      'America/Los_Angeles',
      '2026-05-02T04:00:00Z',
      'Friday, May 1, 2026',
      MARKERS.day2,
    )
  })

  it('Tokyo early-morning user gets local-today content, not UTC-yesterday', async () => {
    // 2026-05-01T23:00:00Z → 2026-05-02T08:00 JST. UTC is still 2026-05-01 but locally it's 2026-05-02.
    // Old code would have requested 2026-05-01 → day 2. Fix: requests 2026-05-02 → day 3.
    await assertDateAndMarker(
      'Asia/Tokyo',
      '2026-05-01T23:00:00Z',
      'Saturday, May 2, 2026',
      MARKERS.day3,
    )
  })
})
