import { apiKeyService } from '#server/database/api-keys'

export default defineEventHandler(async (event) => {
  if (event.context.apiKeyAuth) {
    throw createError({ statusCode: 403, statusMessage: 'API keys cannot be managed via API key auth' })
  }
  const user = await requirePermission(event, 'users.manage')
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid API key ID' })
  }

  const revoked = await apiKeyService.revokeApiKey(id, user.userId)

  if (!revoked) {
    throw createError({ statusCode: 404, statusMessage: 'API key not found' })
  }

  return { success: true }
})
