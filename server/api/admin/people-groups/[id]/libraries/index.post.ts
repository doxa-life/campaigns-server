import { libraryService } from '#server/database/libraries'
import { peopleGroupService } from '#server/database/people-groups'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  // Require content.edit permission
  const user = await requirePermission(event, 'content.edit')

  const id = getIntParam(event, 'id')

  // Check if user has access to this people group
  const hasAccess = await peopleGroupService.userCanAccessPeopleGroup(user.userId, id)
  if (!hasAccess) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have access to this people group'
    })
  }

  const body = await readBody(event)

  // Validate required fields
  if (!body.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Library name is required'
    })
  }

  try {
    const library = await libraryService.createLibrary({
      name: body.name,
      description: body.description,
      repeating: body.repeating,
      people_group_id: id,
      library_key: body.library_key || null
    })

    logCreate('libraries', String(library.id), event)

    return {
      success: true,
      library
    }
  } catch (error) {
    handleApiError(error, 'Failed to create library', 400)
  }
})
