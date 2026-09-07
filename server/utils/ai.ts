/**
 * AI Helpers
 *
 * Forced tool calls over the OpenRouter chat-completions API. Every AI feature —
 * inbox draft replies, knowledge capture, report parsing — asks the model for one
 * structured result by declaring a single tool and requiring the model to call it,
 * so callers get a typed object instead of prose to parse.
 */

import { appConfigService } from '../database/app-config'
import { openrouterChat, isOpenRouterConfigured, OpenRouterError } from './openrouter'

/** app_config key holding the model used for every AI call. */
export const AI_MODEL_CONFIG_KEY = 'ai_model'

const DEFAULT_AI_MODEL = 'anthropic/claude-sonnet-4.6'

/** Transient failures are retried this many times in total before surfacing. */
const MAX_ATTEMPTS = 3

export function isAiConfigured(): boolean {
  return isOpenRouterConfigured()
}

/** OpenRouter routes on a `provider/model` id; anything else cannot be dispatched. */
function routable(model: string | null | undefined): string | null {
  return model && model.includes('/') ? model : null
}

/**
 * The model used for all AI calls (report parsing and inbox alike). The
 * superadmin-managed app_config value wins; with none set it falls back to the
 * INBOX_AI_MODEL env var, then a safe default. A single source so changing the
 * model is one setting, not a code edit per call site.
 */
export async function getAiModel(): Promise<string> {
  const stored = await appConfigService.getConfig<string>(AI_MODEL_CONFIG_KEY)
  return routable(stored) || routable(useRuntimeConfig().inboxAiModel) || DEFAULT_AI_MODEL
}

/**
 * A segment of the system prompt. `cache` marks the end of a cacheable prefix, so
 * repeated calls in a burst reuse the tokens up to that point rather than paying
 * for them again. Providers that cache automatically ignore the marker.
 */
export interface AiSystemBlock {
  text: string
  cache?: boolean
}

/** The single tool a call declares; `parameters` is the JSON Schema of the result. */
export interface AiTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface AiToolCallOptions {
  model: string
  system: AiSystemBlock[]
  user: string
  tool: AiTool
  /** Response cap. A truncated forced-tool response yields partial JSON, not an error. */
  maxTokens: number
  temperature?: number
  /** Prefixes server logs so a failure names the feature that made the call. */
  label: string
}

/**
 * Run one forced tool call and return the tool's arguments.
 *
 * Retryable failures (rate limits, provider 5xx, connection trouble) are retried with
 * backoff; everything else surfaces immediately as an OpenRouterError for the caller
 * to convert with `toAiHttpError`.
 */
export async function callAiTool<T>(opts: AiToolCallOptions): Promise<Partial<T>> {
  const { model, system, user, tool, maxTokens, temperature, label } = opts

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: system.map(block => ({
          type: 'text',
          text: block.text,
          ...(block.cache ? { cache_control: { type: 'ephemeral' } } : {}),
        })),
      },
      { role: 'user', content: user },
    ],
    tools: [{ type: 'function', function: tool }],
    tool_choice: { type: 'function', function: { name: tool.name } },
  }
  // OpenRouter drops parameters the chosen model does not accept, so a temperature
  // can be sent without checking which models support one.
  if (temperature !== undefined) body.temperature = temperature

  let response
  for (let attempt = 1; ; attempt++) {
    try {
      response = await openrouterChat(body, label)
      break
    } catch (error) {
      const retryable = error instanceof OpenRouterError && error.retryable
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }

  const choice = response.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('The AI response was cut off before completion — try again')
  }
  if (choice?.finish_reason === 'content_filter') {
    throw new Error('The AI declined to complete this request')
  }

  const call = choice?.message?.tool_calls?.find(c => c.function?.name === tool.name)
  if (!call?.function?.arguments) {
    throw new Error('Unexpected response from AI — no tool call returned')
  }

  try {
    return JSON.parse(call.function.arguments) as Partial<T>
  } catch {
    throw new Error('The AI returned malformed output — try again')
  }
}

/**
 * Convert an AI provider failure into a clean H3 error so callers can tell transient
 * upstream trouble from misconfiguration. Rate limits, provider outages, and
 * connection failures become a 502 the UI can present as "try again in a moment";
 * anything needing a human (revoked key, no credits, rejected model id) becomes a 500
 * pointing the operator at the logs. The raw provider message is logged here and never
 * sent to the client. Other errors pass through unchanged.
 *
 * 503 is reserved for "AI is not configured" (no API key), so the UI's status-code
 * branches stay unambiguous.
 */
export function toAiHttpError(error: unknown, logContext: string): Error {
  if (!(error instanceof OpenRouterError)) return error as Error
  console.error(`${logContext}:`, error.status ?? 'connection error', error.message)
  if (error.retryable) {
    return createError({ statusCode: 502, statusMessage: 'AI is temporarily unavailable' })
  }
  return createError({ statusCode: 500, statusMessage: 'AI is misconfigured — check the server logs' })
}
