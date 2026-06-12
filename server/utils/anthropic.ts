import Anthropic from '@anthropic-ai/sdk'

export function isAnthropicConfigured(): boolean {
  const config = useRuntimeConfig()
  return !!config.anthropicApiKey
}

export function getAnthropicClient(): Anthropic {
  const config = useRuntimeConfig()
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  return new Anthropic({ apiKey: config.anthropicApiKey })
}

/**
 * Sampling parameters are accepted by the 4.6-family models but rejected with a 400
 * by everything newer (Opus 4.7+, the Claude 5 family), where prompting is the only
 * steering mechanism. Spread the result into a messages.create call so a temperature
 * is sent only to models known to accept it.
 */
export function temperatureFor(model: string, temperature: number): { temperature?: number } {
  return model.includes('-4-6') ? { temperature } : {}
}

/**
 * Convert an Anthropic SDK error into a clean H3 error so callers can tell transient
 * upstream trouble from misconfiguration. Rate limits, overload, Anthropic 5xx, and
 * connection failures (the SDK has already retried these with backoff) become a 502
 * the UI can present as "try again in a moment"; auth/request errors (revoked key,
 * bad model id) become a 500 pointing the operator at the logs. The raw SDK message
 * is logged here and never sent to the client. Non-SDK errors pass through unchanged.
 *
 * 503 is reserved for "AI is not configured" (no API key), so the UI's status-code
 * branches stay unambiguous.
 */
export function toAnthropicHttpError(error: unknown, logContext: string): Error {
  if (!(error instanceof Anthropic.APIError)) return error as Error
  console.error(`${logContext}:`, error.status ?? 'connection error', error.message)
  if (!error.status || error.status === 408 || error.status === 429 || error.status >= 500) {
    return createError({ statusCode: 502, statusMessage: 'AI is temporarily unavailable' })
  }
  return createError({ statusCode: 500, statusMessage: 'AI is misconfigured — check the server logs' })
}
