/**
 * GET /api/admin/people-groups/without-prayer-pdf
 * Download a PDF of every active people group with no one signed up to pray for them.
 */
import { buildGroupsWithoutPrayerPdf, getGroupsWithoutPrayer } from '../../../utils/app/groups-without-prayer-pdf'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const groups = await getGroupsWithoutPrayer()
  const siteUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  const pdf = await buildGroupsWithoutPrayerPdf(groups, siteUrl)

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="groups-without-prayer-${new Date().toISOString().slice(0, 10)}.pdf"`,
    'Cache-Control': 'no-store'
  })

  return Buffer.from(pdf)
})
