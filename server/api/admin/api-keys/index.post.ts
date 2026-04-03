import { apiKeyService } from '#server/database/api-keys'

export default defineEventHandler(async (event) => {
  if (event.context.apiKeyAuth) {
    throw createError({ statusCode: 403, statusMessage: 'API keys cannot be managed via API key auth' })
  }
  const user = await requirePermission(event, 'users.manage')
  const body = await readBody(event)

  const name = body?.name?.trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'API key name is required' })
  }

  if (name.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'API key name must be 100 characters or less' })
  }

  const { apiKey, plaintextKey } = await apiKeyService.createApiKey(user.userId, name)

  return {
    key: apiKey,
    plaintext_key: plaintextKey
  }
})
