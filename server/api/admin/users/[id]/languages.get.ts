import { userLanguageService } from '#server/database/user-languages'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const userId = getUuidParam(event, 'id')

  try {
    const assignedLanguages = await userLanguageService.getUserLanguages(userId)

    return {
      success: true,
      languages: assignedLanguages
    }
  } catch (error) {
    handleApiError(error, 'Failed to fetch user languages')
  }
})
