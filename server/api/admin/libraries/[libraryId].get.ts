import { libraryService } from '#server/database/libraries'
import { roleService } from '#server/database/roles'
import { peopleGroupService } from '#server/database/people-groups'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'content.view')

  const id = getIntParam(event, 'libraryId')

  const library = await libraryService.getLibraryById(id)

  if (!library) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Library not found'
    })
  }

  const scoped = await roleService.isPermissionScoped(user.userId, 'content.view')
  if (scoped) {
    if (!library.people_group_id || !(await peopleGroupService.userCanAccessPeopleGroup(user.userId, library.people_group_id))) {
      throw createError({ statusCode: 403, statusMessage: 'You do not have access to this library' })
    }
  }

  // Get stats
  const stats = await libraryService.getLibraryStats(id)

  return {
    library: {
      ...library,
      stats
    }
  }
})
