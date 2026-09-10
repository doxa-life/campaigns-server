/**
 * Multi-turn chat with tool use, streamed.
 *
 * Where `callAiTool` in ai.ts forces a single structured result and returns,
 * this runs a conversation: the model may call tools to load more context,
 * gets their results back, and keeps going until it answers in prose. Reply
 * text is handed to the caller as it arrives so a UI can render it live.
 *
 * Text written before a tool call is dropped rather than kept: the model
 * restates its answer once it has the tool results, so keeping the earlier
 * draft would show the reader a half-formed reply. `onTextDiscard` fires so a
 * live view can clear what it has already painted.
 */

import { getAiModel } from './ai'
import { openrouterChatStream, OpenRouterError } from './openrouter'

/**
 * A piece of the system prompt. `cache` marks the end of a cacheable prefix so
 * repeated calls reuse the tokens up to that point. Providers that cache
 * automatically ignore the marker.
 */
export interface AiTextPart {
  type: 'text'
  text: string
  cache?: boolean
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string | AiTextPart[]
}

/** A tool the model may call; `parameters` is the JSON Schema of its input. */
export interface AiChatTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Runs one tool call and returns what the model should see as its result. */
export type AiToolHandler = (
  name: string,
  input: Record<string, unknown>
) => Promise<string> | string

export interface ChatCompleteOptions {
  system: AiTextPart[]
  messages: AiChatMessage[]
  tools?: AiChatTool[]
  onToolCall?: AiToolHandler
  maxTokens: number
  /** Tool rounds allowed before the model must answer without further loading. */
  maxToolRounds?: number
  onTextDelta?: (text: string) => void
  onTextDiscard?: () => void
  /** Prefixes server logs so a failure names the feature that made the call. */
  label: string
  /** Overrides the app-wide AI model. */
  model?: string
}

export interface ChatCompleteResult {
  text: string
}

interface StreamedToolCall {
  id: string
  name: string
  arguments: string
}

function toContentParts(content: string | AiTextPart[]): unknown {
  if (typeof content === 'string') return content
  return content.map(part => ({
    type: 'text',
    text: part.text,
    ...(part.cache ? { cache_control: { type: 'ephemeral' } } : {})
  }))
}

/**
 * Merge one streamed chunk's tool-call deltas into the calls collected so far.
 * Providers send a call's name once and its arguments in fragments, keyed by
 * the `index` of the call within the round.
 */
function mergeToolCallDeltas(
  into: Map<number, StreamedToolCall>,
  deltas: Array<Record<string, any>>
): void {
  for (const delta of deltas) {
    const index = typeof delta.index === 'number' ? delta.index : 0
    const existing = into.get(index) ?? { id: '', name: '', arguments: '' }
    if (delta.id) existing.id = String(delta.id)
    if (delta.function?.name) existing.name = String(delta.function.name)
    if (delta.function?.arguments) existing.arguments += String(delta.function.arguments)
    into.set(index, existing)
  }
}

function parseToolInput(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * Run a chat turn to completion and return the model's final reply text.
 *
 * Throws an OpenRouterError for provider failures; convert it for the client
 * with `toAiHttpError` from ai.ts.
 */
export async function chatComplete(options: ChatCompleteOptions): Promise<ChatCompleteResult> {
  const {
    system, messages, tools, onToolCall, maxTokens,
    maxToolRounds = 4, onTextDelta, onTextDiscard, label
  } = options

  const model = options.model ?? await getAiModel()

  const wire: unknown[] = [
    {
      role: 'system',
      content: system.map(part => ({
        type: 'text',
        text: part.text,
        ...(part.cache ? { cache_control: { type: 'ephemeral' } } : {})
      }))
    },
    ...messages.map(m => ({ role: m.role, content: toContentParts(m.content) }))
  ]

  const toolSpec = tools?.length
    ? tools.map(t => ({ type: 'function', function: t }))
    : undefined

  for (let round = 0; ; round++) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: wire
    }
    // Once the tool budget is spent the model is asked to answer from what it
    // already has, rather than being offered tools it may not use.
    if (toolSpec && onToolCall && round < maxToolRounds) body.tools = toolSpec

    let text = ''
    let finishReason: string | null = null
    const toolCalls = new Map<number, StreamedToolCall>()

    for await (const chunk of openrouterChatStream(body, label)) {
      const choice = chunk.choices?.[0]
      if (!choice) continue

      const deltaText = choice.delta?.content
      if (typeof deltaText === 'string' && deltaText.length > 0) {
        text += deltaText
        onTextDelta?.(deltaText)
      }
      if (Array.isArray(choice.delta?.tool_calls)) {
        mergeToolCallDeltas(toolCalls, choice.delta.tool_calls)
      }
      if (choice.finish_reason) finishReason = String(choice.finish_reason)
    }

    const calls = [...toolCalls.values()].filter(c => c.name)
    if (calls.length === 0 || !onToolCall || round >= maxToolRounds) {
      if (finishReason === 'length') {
        throw new Error('The AI response was cut off before completion — try again')
      }
      if (finishReason === 'content_filter' || finishReason === 'refusal') {
        throw new Error('The AI declined to complete this request')
      }
      return { text }
    }

    // Whatever the model wrote before deciding to call tools is dropped.
    if (text) onTextDiscard?.()

    wire.push({
      role: 'assistant',
      content: text || null,
      tool_calls: calls.map((c, i) => ({
        id: c.id || `call_${round}_${i}`,
        type: 'function',
        function: { name: c.name, arguments: c.arguments || '{}' }
      }))
    })

    for (const [i, call] of calls.entries()) {
      let result: string
      try {
        result = await onToolCall(call.name, parseToolInput(call.arguments))
      } catch (error) {
        if (error instanceof OpenRouterError) throw error
        result = `Error: ${error instanceof Error ? error.message : 'the tool failed'}`
      }
      wire.push({
        role: 'tool',
        tool_call_id: call.id || `call_${round}_${i}`,
        content: result
      })
    }
  }
}
