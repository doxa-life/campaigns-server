/**
 * GET /api/people-groups/detail/[slug]
 * Get detailed information for a single people group
 * Supports translated labels via ?locale= query param
 */
import { getSql } from '../../../database/db'
import { formatPeopleGroupForDetail } from '../../../utils/app/people-group-formatter'
import { setCacheHeaders } from '../../../utils/app/cors'
import { LANGUAGE_CODES } from '../../../../config/languages'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { appConfigService } from '#server/database/app-config'
import { peopleGroupAdoptionService } from '../../../database/people-group-adoptions'

export default defineEventHandler(async (event) => {
  setCacheHeaders(event)

  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Slug parameter is required'
    })
  }

  // Parse query params - support both 'locale' and legacy 'lang', with Accept-Language fallback
  const query = getQuery(event)
  const acceptLanguage = getHeader(event, 'accept-language')
  const rawLocale = (query.locale as string) || (query.lang as string) || acceptLanguage?.split(',')[0]?.split('-')[0] || 'en'
  const lang = LANGUAGE_CODES.includes(rawLocale) ? rawLocale : 'en'

  const sql = getSql()

  const [peopleGroup] = await sql`
    SELECT
      pg.*,
      pg.people_praying as total_people_praying
    FROM people_groups pg
    WHERE pg.slug = ${slug}
  ` as any[]

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Get commitment stats, global start date, and adoption info
  const [commitmentStats, globalStartDate, adoptions] = await Promise.all([
    peopleGroupSubscriptionService.getCommitmentStats(peopleGroup.id),
    appConfigService.getConfig<string>('global_campaign_start_date'),
    peopleGroupAdoptionService.getForPeopleGroup(peopleGroup.id)
  ])

  const activeAdoptions = adoptions.filter(a => a.status === 'active')
  const publicAdoptions = activeAdoptions.filter(a => a.show_publicly)

  return {
    ...formatPeopleGroupForDetail(peopleGroup, lang),
    people_committed: commitmentStats.people_committed,
    committed_duration: commitmentStats.committed_duration,
    global_start_date: globalStartDate,
    adopted_by_churches: activeAdoptions.length,
    adopted_by_count: activeAdoptions.length,
    adopted_by_names: publicAdoptions.map(a => a.group_name)
  }
})
