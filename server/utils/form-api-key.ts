import type { H3Event } from 'h3'

/**
 * Require a valid form API key in the request.
 * Checks for the key in X-API-Key header or Authorization: Bearer header.
 * Throws 401 if missing/invalid, 500 if FORM_API_KEY is not configured.
 */
export function requireFormApiKey(event: H3Event): void {
  const config = useRuntimeConfig()

  if (!config.formApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Form API key not configured' })
  }

  const authHeader = getHeader(event, 'authorization')
  const apiKeyHeader = getHeader(event, 'x-api-key')

  let key: string | undefined

  if (authHeader?.startsWith('Bearer ')) {
    key = authHeader.substring(7)
  } else if (apiKeyHeader) {
    key = apiKeyHeader
  }

  if (!key || key !== config.formApiKey) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  }
}
