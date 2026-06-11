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
