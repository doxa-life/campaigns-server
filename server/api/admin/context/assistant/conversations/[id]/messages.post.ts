/**
 * POST /api/admin/context/assistant/conversations/:id/messages
 *
 * Send one message: runs the model with the conversation's stored history and
 * scope, then persists both turns. Proposed section updates are parsed only for
 * users who could apply them.
 *
 * With `Accept: text/event-stream` the turn streams as server-sent events:
 * `status` ({ text }) as sections load, `delta` ({ text }) as reply text
 * arrives, `reset` when text written before a tool call is dropped, `ping` as a
 * keep-alive, then `done` with the JSON payload once saved, or `error`
 * ({ statusCode, message }). A client that disconnects does not abort the turn:
 * it still finishes and saves, and the reply shows on the next load.
 *
 * The model call runs outside any transaction — it can take tens of seconds,
 * far too long to hold a pooled connection. Both messages are written together
 * in one short transaction at the end, so a failed turn stores nothing.
 */

import { createEventStream, getRequestHeader, type H3Event } from 'h3'
import { getPortfolioById, contextTransaction, contextDb } from '#server/database/context-portfolios'
import {
  getOwnedConversationOr404,
  listMessages,
  insertMessage,
  touchConversation,
  type ContextMessage,
  type ContextAssistantProposal
} from '#server/database/context-assistant'
import { roleService } from '#server/database/roles'
import { isAiConfigured, toAiHttpError } from '#server/utils/ai'
import { chatComplete } from '#server/utils/ai-chat'
import {
  buildAssistantContext,
  historyToMessages,
  scopeFromConversation,
  stripUpdateBlocks
} from '#server/utils/context/assistant'

const KEEP_ALIVE_MS = 15_000
const MAX_MESSAGE_LENGTH = 20_000

interface Sse {
  push: (name: string, data: unknown) => void
  close: () => Promise<void>
}

/**
 * Open the event stream and send headers at once so progress shows immediately.
 * The send promise settles when the stream closes and is deliberately not
 * awaited, so a dropped client cannot abort the turn; pushes after a drop are
 * no-ops.
 */
function openSse(event: H3Event): Sse {
  const stream = createEventStream(event)
  const keepAlive = setInterval(() => {
    stream.push({ event: 'ping', data: '{}' }).catch(() => {})
  }, KEEP_ALIVE_MS)
  stream.send().catch(() => {})
  return {
    push: (name, data) => {
      stream.push({ event: name, data: JSON.stringify(data) }).catch(() => {})
    },
    close: async () => {
      clearInterval(keepAlive)
      await stream.close()
    }
  }
}

interface TurnResult {
  user_message: ContextMessage
  assistant_message: ContextMessage
  can_apply: boolean
}

export default defineEventHandler(async (event) => {
  const wantsStream = (getRequestHeader(event, 'accept') ?? '').includes('text/event-stream')
  // Set once validation passes and the stream is open; from then on the outcome
  // is reported on the stream rather than as a response body.
  let sse: Sse | null = null

  try {
    const auth = await requirePermission(event, 'context.view')
    const conversation = await getOwnedConversationOr404(getRouterParam(event, 'id') ?? '', auth.userId)

    const body = await readBody<{ message?: string }>(event)
    const message = (body?.message || '').trim()
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      throw createError({ statusCode: 400, statusMessage: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` })
    }
    if (!isAiConfigured()) {
      throw createError({ statusCode: 503, statusMessage: 'The assistant is not configured' })
    }

    const portfolio = conversation.portfolio_id ? await getPortfolioById(conversation.portfolio_id) : null
    if (conversation.portfolio_id && !portfolio) {
      throw createError({ statusCode: 404, statusMessage: 'Portfolio not found' })
    }

    const canApply = await roleService.userHasPermission(auth.userId, 'context.edit')
    const scope = scopeFromConversation(conversation, portfolio)
    const stored = await listMessages(conversation.id)
    const history = historyToMessages(stored)
    const assistant = await buildAssistantContext(contextDb(), scope, canApply)

    if (wantsStream) sse = openSse(event)
    const live = sse

    let reply: string
    try {
      const result = await chatComplete({
        system: assistant.system,
        messages: [...history, { role: 'user', content: message }],
        tools: assistant.tools,
        onToolCall: (name, input) => {
          const what = assistant.describeToolCall(name, input)
          if (what) live?.push('status', { text: `Reading ${what}…` })
          return assistant.onToolCall(name, input)
        },
        onTextDelta: text => live?.push('delta', { text }),
        onTextDiscard: () => live?.push('reset', {}),
        maxTokens: 4096,
        maxToolRounds: 4,
        label: 'context-assistant'
      })
      reply = result.text
    } catch (error) {
      throw toAiHttpError(error, '[context-assistant] turn failed')
    }

    const proposals: ContextAssistantProposal[] = canApply
      ? assistant.parseProposals(reply).map(p => ({ ...p, status: 'pending' as const }))
      : []

    const payload: TurnResult = await contextTransaction(async (tx) => {
      const userMessage = await insertMessage({
        conversationId: conversation.id, role: 'user', content: message
      }, tx)
      const assistantMessage = await insertMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: stripUpdateBlocks(reply),
        proposals,
        contextLoaded: assistant.contextLoaded
      }, tx)
      await touchConversation(conversation.id, stored.length === 0 ? message : undefined, tx)
      return { user_message: userMessage, assistant_message: assistantMessage, can_apply: canApply }
    })

    if (!live) return payload
    live.push('done', payload)
  } catch (error) {
    if (!sse) throw error
    const failure = error as { statusCode?: number, statusMessage?: string }
    if (!failure.statusCode || failure.statusCode >= 500) {
      console.error('[context-assistant] turn failed mid-stream:', error)
    }
    sse.push('error', {
      statusCode: failure.statusCode ?? 500,
      message: failure.statusMessage ?? 'Something went wrong.'
    })
  } finally {
    await sse?.close()
  }
})
