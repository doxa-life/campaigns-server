import { apiKeyService } from '#server/database/api-keys'

export default defineEventHandler(async (event) => {
  if (event.context.apiKeyAuth) {
    throw createError({ statusCode: 403, statusMessage: 'API keys cannot be managed via API key auth' })
  }
  const user = await requirePermission(event, 'users.manage')
  const keys = await apiKeyService.getUserApiKeys(user.userId)
  return { keys }
})
