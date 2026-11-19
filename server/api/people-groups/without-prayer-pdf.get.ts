/**
 * GET /api/people-groups/without-prayer-pdf
 * Public PDF of every active people group with no one signed up to pray for
 * them. Linked from the marketing site's UUPGs page. Same content as the admin
 * download; opens in the browser instead of downloading.
 */
import { buildGroupsWithoutPrayerPdf, getGroupsWithoutPrayer } from '../../utils/app/groups-without-prayer-pdf'
import { setCacheHeaders } from '../../utils/app/cors'

const CACHE_MS = 10 * 60 * 1000
let cached: { pdf: Buffer, builtAt: number } | null = null

export default defineEventHandler(async (event) => {
  if (!cached || Date.now() - cached.builtAt > CACHE_MS) {
    const groups = await getGroupsWithoutPrayer()
    const siteUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
    const pdf = await buildGroupsWithoutPrayerPdf(groups, siteUrl)
    cached = { pdf: Buffer.from(pdf), builtAt: Date.now() }
  }

  setCacheHeaders(event, { maxAge: 600, sMaxAge: 600 })
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="people-groups-without-prayer.pdf"'
  })

  return cached.pdf
})
