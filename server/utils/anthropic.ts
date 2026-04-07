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
