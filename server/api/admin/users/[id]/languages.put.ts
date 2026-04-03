import { userLanguageService } from '#server/database/user-languages'
import { userService } from '#server/database/users'
import { handleApiError, getUuidParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users.manage')

  const userId = getUuidParam(event, 'id')
  const body = await readBody(event)

  if (!Array.isArray(body.language_codes)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'language_codes must be an array'
    })
  }

  try {
    const user = await userService.getUserById(userId)
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    await userLanguageService.setUserLanguages(userId, body.language_codes)

    return {
      success: true,
      languages: body.language_codes,
      message: 'User language access updated'
    }
  } catch (error) {
    handleApiError(error, 'Failed to update user languages')
  }
})
