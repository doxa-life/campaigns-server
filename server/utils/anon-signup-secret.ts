import type { H3Event } from 'h3'

/**
 * Require the bundled mobile-app shared secret.
 * Checks the `X-App-Secret` header against `ANON_SIGNUP_SECRET`.
 * Throws 500 if the secret is not configured, 403 if missing/invalid.
 *
 * This is a deterrent against casual abuse, NOT real authentication — a
 * secret bundled into a client app is extractable. Strong anti-abuse
 * (app attestation, rate limiting) is handled separately.
 */
export function requireAnonSignupSecret(event: H3Event): void {
  const config = useRuntimeConfig()

  if (!config.anonSignupSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Anon signup secret not configured' })
  }

  const provided = getHeader(event, 'x-app-secret')

  if (!provided || provided !== config.anonSignupSecret) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

/**
 * Require either the mobile-app shared secret (`X-App-Secret`) OR the form
 * API key (`X-API-Key` / `Authorization: Bearer`). Used by endpoints that
 * serve both the mobile app and external forms (e.g. the marketing site).
 * Throws 403 if neither matches.
 */
export function requireAppSecretOrFormApiKey(event: H3Event): void {
  const config = useRuntimeConfig()

  if (!config.anonSignupSecret && !config.formApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'No signup auth configured' })
  }

  const appSecret = getHeader(event, 'x-app-secret')
  if (config.anonSignupSecret && appSecret && appSecret === config.anonSignupSecret) {
    return
  }

  const authHeader = getHeader(event, 'authorization')
  const apiKeyHeader = getHeader(event, 'x-api-key')

  let key: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    key = authHeader.substring(7)
  } else if (apiKeyHeader) {
    key = apiKeyHeader
  }

  if (config.formApiKey && key && key === config.formApiKey) {
    return
  }

  throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
}
