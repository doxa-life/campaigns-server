import { getAiModel, callAiTool, toAiHttpError, type AiSystemBlock, type AiTool } from '#server/utils/ai'
import { conversationService } from '#server/database/conversations'
import { messageService, type ConversationMessage } from '#server/database/conversation-messages'
import { getStaticPack, getKnowledgeBlock, formatContactRecord } from './ai-draft-grounding'
import { buildDraftInstructions } from './ai-draft-instructions'
import { ENABLED_LANGUAGE_CODES } from '../../../config/languages'

export interface InboxDraftResult {
  draft_language: string
  draft_html: string
  draft_text: string
  english_gloss: string
  sources_used: string[]
  uncertainty: string[]
}

const DRAFT_TOOL: AiTool = {
  name: 'submit_draft',
  description: 'Submit the drafted reply for human review',
  parameters: {
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

  const instructions = buildDraftInstructions({
    siteUrl: useRuntimeConfig().public.siteUrl || 'http://localhost:3000',
    languageCodes: ENABLED_LANGUAGE_CODES,
  })

  // System = cacheable prefix. Block 1 (instructions + tone + static pack) and block 2
  // (knowledge base) are marked cacheable so repeated drafts in a burst reuse them cheaply.
  const system: AiSystemBlock[] = [
    { text: `${instructions}\n\n${staticPack}`, cache: true },
  ]
  if (knowledgeBlock) {
    system.push({ text: knowledgeBlock, cache: true })
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

  // The tool input carries the reply roughly three times over (html + text + gloss),
  // so the cap needs generous headroom — a truncated forced-tool response yields
  // partial JSON, not an error.
  let parsed: Partial<InboxDraftResult>
  try {
    parsed = await callAiTool<InboxDraftResult>({
      model: await getAiModel(),
      system,
      user: userContent,
      tool: DRAFT_TOOL,
      maxTokens: 8192,
      temperature: 0.4,
      label: 'Inbox draft',
    })
  } catch (error) {
    throw toAiHttpError(error, 'AI draft call failed')
  }

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
