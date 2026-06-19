import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient, getAiModel, temperatureFor, toAnthropicHttpError } from '#server/utils/anthropic'
import { conversationService } from '#server/database/conversations'
import { messageService, type ConversationMessage } from '#server/database/conversation-messages'
import { getStaticPack, getKnowledgeBlock, formatContactRecord } from './ai-draft-grounding'

export interface InboxDraftResult {
  draft_language: string
  draft_html: string
  draft_text: string
  english_gloss: string
  sources_used: string[]
  uncertainty: string[]
}

const INSTRUCTIONS = `You draft email replies for the Doxa team. A human teammate reviews and edits every draft before it is sent, so your job is to produce the best possible starting point — not a finished, auto-sent message.

Follow the VOICE & TONE GUIDE below exactly. Ground every Doxa-specific fact in the provided material (the website content, feature reference, and past team answers). Never invent giving amounts, dates, definitions, counts, or policies — if a needed fact is absent, leave a bracketed placeholder in the body and record it in uncertainty.

When a contact asks about people groups in a specific country, point them to that country's page using its full https://doxa.life/countries/<slug> URL from the country list in the website content. Only link a country that appears in that list.

Language:
- Write the reply in the language the contact is using (infer it from their most recent message; fall back to their preferred language from the contact record). Put that language code in draft_language.
- english_gloss must be a faithful, literal back-translation of the EXACT draft you wrote, so an English-only reviewer can verify it. If the draft is already in English, set english_gloss equal to the draft text.

Output ONLY by calling the submit_draft tool.`

const DRAFT_TOOL = {
  name: 'submit_draft',
  description: 'Submit the drafted reply for human review',
  input_schema: {
    type: 'object' as const,
    properties: {
      draft_language: {
        type: 'string' as const,
        description: "ISO language code of the draft (e.g. 'en', 'es', 'fr')",
      },
      draft_html: {
        type: 'string' as const,
        description: 'The reply body as simple HTML (paragraphs, lists, links). No signature.',
      },
      draft_text: {
        type: 'string' as const,
        description: 'The same reply as plain text.',
      },
      english_gloss: {
        type: 'string' as const,
        description: 'Faithful English back-translation of the exact draft (equal to the draft if already English).',
      },
      sources_used: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Short labels of grounding pieces that informed the answer (e.g. "FAQ: giving", "feature: adoption").',
      },
      uncertainty: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Facts you were unsure about or bracketed placeholders the reviewer must fill in. Empty if none.',
      },
    },
    required: ['draft_language', 'draft_html', 'draft_text', 'english_gloss'],
  },
}

// Best-effort HTML → text for building the thread context.
function messageText(m: ConversationMessage): string {
  if (m.body_text && m.body_text.trim()) return m.body_text.trim()
  const html = m.body_html || m.body_stripped_html || ''
  return html
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildThread(messages: (ConversationMessage & { sender_name?: string | null })[]): string {
  if (!messages.length) return '(no prior messages)'
  return messages
    .map(m => {
      const who = m.direction === 'inbound'
        ? `CONTACT (${m.from_name || m.from_email || 'unknown'})`
        : `DOXA TEAM (${m.sender_name || 'team'})`
      return `--- ${who} — ${m.created_at} ---\n${messageText(m)}`
    })
    .join('\n\n')
}

// Deterministic offline stub so e2e tests never call the live API (mirrors how the
// schedulers and Mailgun signature check short-circuit under VITEST).
function stubDraft(): InboxDraftResult {
  const text = 'Thank you for reaching out — we are glad you wrote in. [AI drafting is stubbed in the test environment.]'
  return {
    draft_language: 'en',
    draft_html: `<p>${text}</p>`,
    draft_text: text,
    english_gloss: text,
    sources_used: [],
    uncertainty: [],
  }
}

/**
 * Generate an AI draft reply for a conversation, grounded in the static context pack
 * (cached), the captured knowledge base (cached), and the contact's live record +
 * thread (per request). Returns the structured draft for human review.
 *
 * `direction` is an optional free-text steer from the reviewing teammate (e.g. "ask
 * them to sign up for a people group in their country and link to its page"). It
 * shapes the draft but never overrides the tone guide or the grounding rules.
 *
 * `baseDraft` is an optional current draft to revise rather than start from scratch —
 * how the modal's "refine" loop carries the teammate's edits into the next pass.
 */
export async function generateInboxDraft(
  conversationId: number,
  opts: { direction?: string; baseDraft?: string } = {},
): Promise<InboxDraftResult> {
  const { direction, baseDraft } = opts
  const conversation = await conversationService.getById(conversationId)
  if (!conversation) throw new Error('Conversation not found')

  const [messages, contactRecord, staticPack, knowledgeBlock] = await Promise.all([
    messageService.listForConversation(conversationId),
    formatContactRecord(conversation.subscriber_id),
    getStaticPack(),
    getKnowledgeBlock(),
  ])

  // System = cacheable prefix. Block 1 (instructions + tone + static pack) and block 2
  // (knowledge base) get cache_control so repeated drafts in a burst reuse them cheaply.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: `${INSTRUCTIONS}\n\n${staticPack}`,
      cache_control: { type: 'ephemeral' },
    },
  ]
  if (knowledgeBlock) {
    system.push({ type: 'text', text: knowledgeBlock, cache_control: { type: 'ephemeral' } })
  }

  const userContent = [
    `CONTACT RECORD\n${contactRecord}`,
    `CONVERSATION SUBJECT: ${conversation.subject || '(none)'}`,
    `CONVERSATION THREAD (oldest first)\n${buildThread(messages)}`,
    baseDraft
      ? `CURRENT DRAFT (revise this rather than starting over — keep what works, preserve the content the instructions call for, and change only what they ask):\n${baseDraft}`
      : null,
    direction
      ? `INSTRUCTIONS FROM THE REVIEWING TEAMMATE (satisfy ALL of them together — a later instruction adds to the earlier ones and does not cancel them unless it directly contradicts one, in which case the later wins. Still follow the tone guide and ground every fact in the provided material):\n${direction}`
      : null,
    baseDraft
      ? `Revise the current draft for the most recent CONTACT message. Call submit_draft with the result.`
      : `Draft a reply to the most recent CONTACT message. Call submit_draft with the result.`,
  ].filter(Boolean).join('\n\n')

  // Stub at the network boundary: tests exercise everything above (DB reads, thread
  // building, prompt assembly) and skip only the API call.
  if (process.env.VITEST) return stubDraft()

  const client = getAnthropicClient()

  // The tool input carries the reply roughly three times over (html + text + gloss),
  // so the cap needs generous headroom — a truncated forced-tool response yields
  // partial JSON, not an error.
  const model = await getAiModel()
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model,
      max_tokens: 8192,
      ...temperatureFor(model, 0.4),
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [DRAFT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_draft' },
    })
  } catch (error) {
    throw toAnthropicHttpError(error, 'AI draft call failed')
  }

  if (response.stop_reason === 'max_tokens') {
    throw new Error('AI draft was cut off before completion — try again')
  }
  if (response.stop_reason === 'refusal') {
    throw new Error('AI declined to draft a reply for this conversation')
  }

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Unexpected response from AI — no tool use block')
  }
  const parsed = toolBlock.input as Partial<InboxDraftResult>

  const draftHtml = (parsed.draft_html || '').trim()
  const draftText = (parsed.draft_text || '').trim()
  if (!draftHtml || !draftText) {
    throw new Error('AI returned an empty draft — try again')
  }

  return {
    draft_language: parsed.draft_language || 'en',
    draft_html: draftHtml,
    draft_text: draftText,
    english_gloss: parsed.english_gloss || draftText,
    sources_used: parsed.sources_used ?? [],
    uncertainty: parsed.uncertainty ?? [],
  }
}
