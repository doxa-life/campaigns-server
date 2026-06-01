import { prayerContentService } from '#server/database/prayer-content'
import { peopleGroupService } from '#server/database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require content.view permission
  const user = await requirePermission(event, 'content.view')

  const id = getIntParam(event, 'id')
  const query = getQuery(event)

  // Check if user has access to this people group
  const hasAccess = await peopleGroupService.userCanAccessPeopleGroup(user.userId, id)
  if (!hasAccess) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this people group'
    })
  }

  const options = {
    startDate: query.startDate as string | undefined,
    endDate: query.endDate as string | undefined,
    language: query.language as string | undefined,
    limit: query.limit ? parseInt(query.limit as string) : undefined,
    offset: query.offset ? parseInt(query.offset as string) : undefined
  }

  // If grouped by date is requested, return grouped data
  if (query.grouped === 'true') {
    const grouped = await prayerContentService.getPeopleGroupContentGroupedByDate(id, options)

    // For each date, get the content for all languages
    const groupedWithContent = await Promise.all(grouped.map(async (group) => {
      const dateContent = await prayerContentService.getPeopleGroupPrayerContent(id, {
        startDate: group.date,
        endDate: group.date
      })

      return {
        date: group.date,
        languages: group.languages,
        content: dateContent
      }
    }))

    return {
      content: groupedWithContent,
      total: grouped.length
    }
  }

  const content = await prayerContentService.getPeopleGroupPrayerContent(id, options)
  const count = await prayerContentService.getContentCount(id)

  return {
    content,
    count,
    total: count
  }
})
