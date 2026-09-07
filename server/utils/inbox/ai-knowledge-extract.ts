import { getAiModel, callAiTool, toAiHttpError, type AiTool } from '#server/utils/ai'
import { conversationService } from '#server/database/conversations'
import { messageService, type ConversationMessage } from '#server/database/conversation-messages'

export interface KnowledgeExtractResult {
  question: string
  answer: string
  language: string
  removed: string[]
}

const SYSTEM_PROMPT = `You convert a resolved support email thread into ONE reusable, fully ANONYMISED question-and-answer entry for an internal knowledge base. The entry will be reference material for drafting future replies to similar questions — so generalise it and remove anything personal.

Produce, via the submit_knowledge_entry tool:
- question: a generalised version of what the contact was asking, with every personal detail removed (no names, no specifics that identify the person or their church).
- answer: the team's answer, cleaned and generalised, accurate and reusable. Do NOT invent facts that weren't in the thread; keep only what was actually said.
- language: ISO code of the answer's language (e.g. 'en').
- removed: list each TYPE of personal information you stripped (e.g. "first name", "email address", "church name", "city", "personal circumstance"). Empty array if there was none.

Strip ALL personally identifying information: names, email addresses, phone numbers, postal addresses, church/organisation names, specific locations, and any personal circumstances that could identify someone. When in doubt, generalise.`

const KNOWLEDGE_TOOL: AiTool = {
  name: 'submit_knowledge_entry',
  description: 'Submit the anonymised knowledge-base entry',
  parameters: {
    type: 'object' as const,
    properties: {
      question: { type: 'string' as const, description: 'Generalised, anonymised question' },
      answer: { type: 'string' as const, description: 'Generalised, anonymised reference answer' },
      language: { type: 'string' as const, description: "ISO language code, e.g. 'en'" },
      removed: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Types of personal information stripped',
      },
    },
    required: ['question', 'answer', 'language'],
  },
}

function messageText(m: ConversationMessage): string {
  if (m.body_text && m.body_text.trim()) return m.body_text.trim()
  const html = m.body_html || m.body_stripped_html || ''
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s{2,}/g, ' ').trim()
}

function stubEntry(): KnowledgeExtractResult {
  return {
    question: 'How does adopting a people group work?',
    answer: 'Adoption is a long-term commitment built on three pillars: pray, give, and send. [Stubbed in test environment.]',
    language: 'en',
    removed: ['first name'],
  }
}

/**
 * Extract a single anonymised Q&A entry from a resolved conversation. Returns a
 * proposal for human review — it is NOT saved here.
 */
export async function extractKnowledgeEntry(conversationId: number): Promise<KnowledgeExtractResult> {
  const conversation = await conversationService.getById(conversationId)
  if (!conversation) throw new Error('Conversation not found')

  const messages = await messageService.listForConversation(conversationId)

  const thread = messages
    .map(m => `${m.direction === 'inbound' ? 'CONTACT' : 'TEAM'}: ${messageText(m)}`)
    .join('\n\n')

  // Stub at the network boundary: tests exercise the DB reads and thread assembly
  // above and skip only the API call.
  if (process.env.VITEST) return stubEntry()

  let parsed: Partial<KnowledgeExtractResult>
  try {
    parsed = await callAiTool<KnowledgeExtractResult>({
      model: await getAiModel(),
      system: [{ text: SYSTEM_PROMPT }],
      user: `SUBJECT: ${conversation.subject || '(none)'}\n\nTHREAD:\n${thread}`,
      tool: KNOWLEDGE_TOOL,
      maxTokens: 2048,
      temperature: 0,
      label: 'Inbox knowledge extract',
    })
  } catch (error) {
    throw toAiHttpError(error, 'AI knowledge-extract call failed')
  }

  const question = (parsed.question || '').trim()
  const answer = (parsed.answer || '').trim()
  if (!question || !answer) {
    throw new Error('AI returned an empty knowledge entry — try again')
  }

  return {
    question,
    answer,
    language: parsed.language || 'en',
    removed: parsed.removed ?? [],
  }
}
