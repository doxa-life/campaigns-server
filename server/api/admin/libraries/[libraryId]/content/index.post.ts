import { libraryContentService } from '#server/database/library-content'
import { libraryService } from '#server/database/libraries'
import { roleService } from '#server/database/roles'
import { peopleGroupService } from '#server/database/people-groups'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require content.create permission
  const user = await requirePermission(event, 'content.create')

  const libraryId = getIntParam(event, 'libraryId')

  const scoped = await roleService.isPermissionScoped(user.userId, 'content.view')
  if (scoped) {
    const library = await libraryService.getLibraryById(libraryId)
    if (!library || !library.people_group_id || !(await peopleGroupService.userCanAccessPeopleGroup(user.userId, library.people_group_id))) {
      throw createError({ statusCode: 403, statusMessage: 'You do not have access to this library' })
    }
  }

  const body = await readBody(event)

  // Validate required fields
  if (!body.day_number || !body.language_code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Day number and language code are required'
    })
  }

  try {
    const content = await libraryContentService.createLibraryContent({
      library_id: libraryId,
      day_number: body.day_number,
      language_code: body.language_code,
      content_json: body.content_json
    })

    return {
      success: true,
      content
    }
  } catch (error) {
    handleApiError(error, 'Failed to create library content', 400)
  }
})
