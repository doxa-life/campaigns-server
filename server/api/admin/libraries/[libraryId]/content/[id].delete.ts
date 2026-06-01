import { libraryContentService } from '#server/database/library-content'
import { libraryService } from '#server/database/libraries'
import { roleService } from '#server/database/roles'
import { peopleGroupService } from '#server/database/people-groups'
import { handleApiError, getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'content.delete')

  const id = getIntParam(event, 'id')

  const scoped = await roleService.isPermissionScoped(user.userId, 'content.view')
  if (scoped) {
    const existing = await libraryContentService.getLibraryContentById(id)
    const library = existing ? await libraryService.getLibraryById(existing.library_id) : null
    if (!library || !library.people_group_id || !(await peopleGroupService.userCanAccessPeopleGroup(user.userId, library.people_group_id))) {
      throw createError({ statusCode: 403, statusMessage: 'You do not have access to this content' })
    }
  }

  try {
    const success = await libraryContentService.deleteLibraryContent(id)

    if (!success) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Content not found'
      })
    }

    return {
      success: true
    }
  } catch (error) {
    handleApiError(error, 'Failed to delete content', 400)
  }
})
