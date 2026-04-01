/**
 * GET /api/people-groups/:slug/prayer-content/:date
 * Get prayer content for a specific date
 */
import { peopleGroupService } from '#server/database/people-groups'
import { prayerContentService } from '#server/database/prayer-content'
import { appConfigService } from '#server/database/app-config'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const dateParam = getRouterParam(event, 'date')
  const query = getQuery(event)

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'People group slug is required'
    })
  }

  if (!dateParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Date is required'
    })
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateParam)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid date format. Expected YYYY-MM-DD'
    })
  }

  const date = dateParam

  // Get people group by slug
  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Get language preference (default to 'en')
  const defaultLang = 'en'
  const languageCode = (query.language as string) || defaultLang

  // Get ALL prayer content for the date and language from all libraries
  let allContent = await prayerContentService.getAllPrayerContentByDate(peopleGroup.id, date, languageCode)

  // If no content found in requested language, fall back to default language
  if (allContent.length === 0 && languageCode !== defaultLang) {
    allContent = await prayerContentService.getAllPrayerContentByDate(peopleGroup.id, date, defaultLang)
  }

  // Get available languages for this date
  const availableLanguages = await prayerContentService.getAvailableLanguages(peopleGroup.id, date)

  const parsedContent = allContent.map(content => ({
    id: content.id,
    title: content.title,
    language_code: content.language_code,
    content_json: content.content_json,
    content_date: content.content_date,
    content_type: content.content_type || 'static',
    people_group_data: content.people_group_data || null
  }))

  // Get global start date
  const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')

  // Cache for 24 hours at edge (Cloudflare), allow stale content while revalidating
  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600')

  return {
    people_group: {
      id: peopleGroup.id,
      slug: peopleGroup.slug,
      title: peopleGroup.name,
      image_url: peopleGroup.image_url || null,
      default_language: defaultLang
    },
    date,
    language: languageCode,
    availableLanguages,
    content: parsedContent,
    hasContent: parsedContent.length > 0,
    globalStartDate
  }
})
