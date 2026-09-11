/**
 * Portfolio assistant: system prompt, context-loading tools, and the parser for
 * proposed section updates.
 *
 * A conversation runs in one of three scopes, which decides what the prompt
 * preloads and which loading tools the model gets:
 *   section   — the one section is loaded; `load_section` / `load_portfolio`
 *               pull in the rest of that portfolio on demand.
 *   portfolio — every non-empty section of the portfolio is loaded; no tools.
 *   all       — an index of every portfolio is listed; `load_portfolio` and
 *               `load_section` fetch content on demand.
 *
 * Proposed edits come back as fenced `section-update` blocks naming the
 * portfolio and section; the parser validates both against the scope, so the
 * model cannot propose a write outside what the conversation covers.
 */

import type { AiChatTool, AiChatMessage, AiTextPart, AiToolHandler } from '../ai-chat'
import type { SqlClient, ContextPortfolio } from '../../database/context-portfolios'
import { listPortfolios } from '../../database/context-portfolios'
import { getPortfolioSections, type ContextSectionDefinition } from '../../database/context-sections'
import type {
  ContextAssistantProposal,
  ContextConversation,
  ContextMessage
} from '../../database/context-assistant'
import { HISTORY_LIMIT } from '../../database/context-assistant'

export type AssistantScope =
  | { kind: 'section', portfolio: ContextPortfolio, sectionKey: string }
  | { kind: 'portfolio', portfolio: ContextPortfolio }
  | { kind: 'all' }

export type ProposalDraft = Omit<ContextAssistantProposal, 'status'>

export interface AssistantContext {
  system: AiTextPart[]
  tools: AiChatTool[]
  onToolCall: AiToolHandler
  /** Human labels of everything the model has read, in load order. */
  contextLoaded: string[]
  parseProposals: (reply: string) => ProposalDraft[]
  /**
   * What a tool call would read, for progress display: 'Team' or
   * 'DOXA › Team'. Null when it would load nothing.
   */
  describeToolCall: (name: string, input: Record<string, unknown>) => string | null
}

interface PortfolioEntry {
  portfolio: ContextPortfolio
  sections: ContextSectionDefinition[]
  /** Every stored section body, keyed by section key. Empty bodies are absent. */
  content: Map<string, string>
  /** Keys whose content is in the prompt or has been loaded by a tool. */
  loaded: Set<string>
}

export function scopeFromConversation(
  conversation: ContextConversation,
  portfolio: ContextPortfolio | null
): AssistantScope {
  if (conversation.portfolio_id && portfolio) {
    return conversation.section_key
      ? { kind: 'section', portfolio, sectionKey: conversation.section_key }
      : { kind: 'portfolio', portfolio }
  }
  return { kind: 'all' }
}

export function historyToMessages(messages: ContextMessage[]): AiChatMessage[] {
  const recent = messages.slice(-HISTORY_LIMIT)
  // The newest stored turn carries a cache breakpoint so the next turn reads the
  // whole history from cache rather than only the system prompt. An empty turn
  // (a reply that was only update blocks) stays a plain string, since an empty
  // text block is rejected upstream.
  return recent.map((m, i): AiChatMessage => ({
    role: m.role,
    content: i === recent.length - 1 && m.content
      ? [{ type: 'text', text: m.content, cache: true }]
      : m.content
  }))
}

function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

async function loadPortfolioEntries(sql: SqlClient, scope: AssistantScope): Promise<PortfolioEntry[]> {
  const portfolios = scope.kind === 'all'
    ? await listPortfolios(sql)
    : [scope.portfolio]
  if (portfolios.length === 0) return []

  const rows = await sql`
    SELECT portfolio_id, section_key, content
    FROM context_sections
    WHERE portfolio_id = ANY(${portfolios.map(p => p.id)}::uuid[])
  ` as unknown as Array<{ portfolio_id: string, section_key: string, content: string }>

  const entries: PortfolioEntry[] = []
  for (const portfolio of portfolios) {
    const content = new Map<string, string>()
    for (const row of rows) {
      if (row.portfolio_id === portfolio.id && typeof row.content === 'string' && row.content.trim().length > 0) {
        content.set(row.section_key, row.content)
      }
    }
    entries.push({
      portfolio,
      sections: await getPortfolioSections(portfolio.id, sql),
      content,
      loaded: new Set()
    })
  }
  return entries
}

const CAPABILITIES = `## Your capabilities:
- Answer questions based on portfolio section content
- Help draft content (emails, messages, documents) using portfolio context
- Suggest updates to portfolio sections when the user provides new information
- Reword, restructure, or refine existing section content on request`

const UPDATE_FORMAT = `## Section update format:
When you determine that one or more sections should be updated, include proposed changes in your response using this exact format (one block per section):

\`\`\`section-update
PORTFOLIO: <portfolio_slug>
SECTION_KEY: <section_key>
SECTION_TITLE: <section_title>
---
<full proposed content for the section>
\`\`\`

Only propose updates when the user's message contains information that should be captured, or when they explicitly ask to modify content. Always explain what you're changing and why before the update blocks.`

const MUST_LOAD = 'Before proposing an update to a section whose content you have NOT yet seen, you MUST load it first. Never blindly overwrite a section.'

const EDIT_NOTICE_CAN_EDIT = 'The user has edit access. They can accept or reject each proposed update individually.'
const EDIT_NOTICE_VIEWER = 'The user has view-only access. You can help them draft content and answer questions, but they cannot save changes to sections. Do NOT propose section updates.'

interface ToolCaps {
  loadSection: number
  loadPortfolio: number
}

function toolCapsFor(scope: AssistantScope): ToolCaps {
  if (scope.kind === 'section') return { loadSection: 3, loadPortfolio: 1 }
  if (scope.kind === 'all') return { loadSection: 5, loadPortfolio: 3 }
  return { loadSection: 0, loadPortfolio: 0 }
}

function scopeIntro(scope: AssistantScope, entries: PortfolioEntry[]): string {
  if (scope.kind === 'section') {
    const title = entries[0]?.sections.find(s => s.key === scope.sectionKey)?.title ?? scope.sectionKey
    return `You are focused on the "${title}" section of the portfolio "${scope.portfolio.name}". The rest of that portfolio is available on request.`
  }
  if (scope.kind === 'portfolio') {
    return `You have the full content of the portfolio "${scope.portfolio.name}".`
  }
  const names = entries.map(e => `"${e.portfolio.name}"`).join(', ')
  return `You have access to every portfolio on this server${names ? `: ${names}` : ''}. Each portfolio describes one organization, team, or initiative.`
}

function loadingNotice(scope: AssistantScope, caps: ToolCaps): string {
  if (scope.kind === 'section') {
    return `The current section is loaded below. Use \`load_section\` to read another section of this portfolio (up to ${caps.loadSection} per turn) or \`load_portfolio\` to read all of it (up to ${caps.loadPortfolio} per turn). ${MUST_LOAD}`
  }
  if (scope.kind === 'portfolio') {
    return 'Every section with content is loaded below. Sections listed without content are empty.'
  }
  return `Nothing is loaded yet. Use \`load_portfolio\` (up to ${caps.loadPortfolio} per turn) to read every section of one portfolio, or \`load_section\` (up to ${caps.loadSection} per turn) for a single section. ${MUST_LOAD}`
}

function portfolioLineNotice(scope: AssistantScope): string {
  if (scope.kind === 'all') return 'The PORTFOLIO line is required and must be one of the slugs listed below.'
  return `The PORTFOLIO line is optional; it defaults to "${scope.portfolio.slug}".`
}

function sectionLine(section: ContextSectionDefinition, entry: PortfolioEntry): string {
  const body = entry.content.get(section.key)
  const size = body ? `${wordCount(body)} words` : 'empty'
  return `- \`${section.key}\`: ${section.title} — ${section.description} (${size})`
}

function sectionIndex(scope: AssistantScope, entries: PortfolioEntry[]): string {
  if (scope.kind !== 'all') {
    const entry = entries[0]
    return entry ? entry.sections.map(s => sectionLine(s, entry)).join('\n') : '(none)'
  }
  if (entries.length === 0) return '(no portfolios yet)'
  return entries
    .map(e => `### ${e.portfolio.name} (slug: \`${e.portfolio.slug}\`)\n${e.sections.map(s => sectionLine(s, e)).join('\n')}`)
    .join('\n\n')
}

function sectionLabel(scope: AssistantScope, entry: PortfolioEntry, key: string): string {
  const title = entry.sections.find(s => s.key === key)?.title ?? key
  return scope.kind === 'all' ? `${entry.portfolio.name} › ${title}` : title
}

function renderLoaded(scope: AssistantScope, entries: PortfolioEntry[]): string {
  const parts: string[] = []
  for (const entry of entries) {
    for (const section of entry.sections) {
      if (!entry.loaded.has(section.key)) continue
      const body = entry.content.get(section.key)
      if (!body) continue
      parts.push(`## ${sectionLabel(scope, entry, section.key)}\n\n${body}`)
    }
  }
  return parts.length ? parts.join('\n\n---\n\n') : '(No sections loaded yet.)'
}

const LOAD_SECTION_TOOL: AiChatTool = {
  name: 'load_section',
  description: 'Load the full content of one portfolio section. Use it before proposing an update to a section you have not seen.',
  parameters: {
    type: 'object',
    properties: {
      portfolio: { type: 'string', description: 'Portfolio slug. Optional when the conversation is scoped to one portfolio.' },
      section_key: { type: 'string', description: 'The section key, e.g. \'team\' or \'vision-and-values\'.' }
    },
    required: ['section_key']
  }
}

const LOAD_PORTFOLIO_TOOL: AiChatTool = {
  name: 'load_portfolio',
  description: 'Load every section of one portfolio at once. Use it when you need broad context.',
  parameters: {
    type: 'object',
    properties: {
      portfolio: { type: 'string', description: 'Portfolio slug. Optional when the conversation is scoped to one portfolio.' }
    }
  }
}

const SECTION_UPDATE_PATTERN = /```\s*section-update\s*\r?\n(?:\s*PORTFOLIO:\s*(.+?)\s*\r?\n)?\s*SECTION_KEY:\s*(.+?)\s*\r?\n\s*SECTION_TITLE:\s*(.+?)\s*\r?\n\s*---\s*\r?\n([\s\S]*?)```/g

export function stripUpdateBlocks(reply: string): string {
  return reply.replace(new RegExp(SECTION_UPDATE_PATTERN.source, SECTION_UPDATE_PATTERN.flags), '').trim()
}

export async function buildAssistantContext(
  sql: SqlClient,
  scope: AssistantScope,
  userCanEdit: boolean
): Promise<AssistantContext> {
  const entries = await loadPortfolioEntries(sql, scope)
  const bySlug = new Map(entries.map(e => [e.portfolio.slug, e]))
  const scopedSlug = scope.kind === 'all' ? null : scope.portfolio.slug
  const contextLoaded: string[] = []

  // Preload per scope. Only sections with content count as loaded, so an empty
  // section stays loadable and reports as empty when asked for.
  for (const entry of entries) {
    const visible = new Set(entry.sections.map(s => s.key))
    const keys = scope.kind === 'portfolio'
      ? [...visible]
      : scope.kind === 'section' ? [scope.sectionKey] : []
    for (const key of keys) {
      if (visible.has(key) && entry.content.has(key)) {
        entry.loaded.add(key)
        contextLoaded.push(sectionLabel(scope, entry, key))
      }
    }
  }

  const caps = toolCapsFor(scope)
  const tools: AiChatTool[] = caps.loadSection > 0 ? [LOAD_SECTION_TOOL, LOAD_PORTFOLIO_TOOL] : []

  // One cacheable part: the prompt is byte-stable across the tool rounds of a
  // turn and across turns until a section changes, so caching-capable models
  // read it from cache after the first call.
  const system: AiTextPart[] = [{
    type: 'text',
    text: [
      'You are an AI assistant for the DOXA context portfolios, helping the team manage organizational knowledge.',
      scopeIntro(scope, entries),
      CAPABILITIES,
      `## Loading additional context:\n${loadingNotice(scope, caps)}`,
      `${UPDATE_FORMAT}\n\n${portfolioLineNotice(scope)}`,
      userCanEdit ? EDIT_NOTICE_CAN_EDIT : EDIT_NOTICE_VIEWER,
      `## Available sections:\n${sectionIndex(scope, entries)}`,
      `## Loaded context:\n${renderLoaded(scope, entries)}`
    ].join('\n\n'),
    cache: true
  }]

  let sectionLoads = 0
  let portfolioLoads = 0

  function resolveEntry(input: Record<string, unknown>): PortfolioEntry | string {
    const raw = typeof input.portfolio === 'string' ? input.portfolio.trim() : ''
    const slug = raw || scopedSlug
    if (!slug) return 'Error: a portfolio slug is required in this conversation.'
    if (scopedSlug && slug !== scopedSlug) return `Error: this conversation is scoped to portfolio '${scopedSlug}'.`
    const entry = bySlug.get(slug)
    return entry ?? `Error: unknown portfolio '${slug}'.`
  }

  function loadOne(entry: PortfolioEntry, key: string): string {
    const body = entry.content.get(key)
    if (!body) return `Section '${key}' of '${entry.portfolio.slug}' exists but has no content yet.`
    if (!entry.loaded.has(key)) {
      entry.loaded.add(key)
      contextLoaded.push(sectionLabel(scope, entry, key))
    }
    return `## ${sectionLabel(scope, entry, key)}\n\n${body}`
  }

  const onToolCall: AiToolHandler = async (name, input) => {
    if (name === 'load_section') {
      if (sectionLoads >= caps.loadSection) return `Error: load_section limit reached (max ${caps.loadSection} per turn).`
      const entry = resolveEntry(input)
      if (typeof entry === 'string') return entry
      const key = typeof input.section_key === 'string' ? input.section_key.trim() : ''
      if (!entry.sections.some(s => s.key === key)) return `Error: unknown section key '${key}' in portfolio '${entry.portfolio.slug}'.`
      if (entry.loaded.has(key)) return `Section '${key}' is already loaded in your context.`
      sectionLoads++
      return loadOne(entry, key)
    }
    if (name === 'load_portfolio') {
      if (portfolioLoads >= caps.loadPortfolio) return `Error: load_portfolio limit reached (max ${caps.loadPortfolio} per turn).`
      const entry = resolveEntry(input)
      if (typeof entry === 'string') return entry
      portfolioLoads++
      const parts = entry.sections
        .filter(s => entry.content.has(s.key))
        .map(s => loadOne(entry, s.key))
      return parts.length ? parts.join('\n\n---\n\n') : `Portfolio '${entry.portfolio.slug}' has no sections with content yet.`
    }
    return `Error: unknown tool '${name}'.`
  }

  function describeToolCall(name: string, input: Record<string, unknown>): string | null {
    const entry = resolveEntry(input)
    if (typeof entry === 'string') return null
    if (name === 'load_portfolio') return `all of ${entry.portfolio.name}`
    if (name === 'load_section') {
      const key = typeof input.section_key === 'string' ? input.section_key.trim() : ''
      return entry.sections.some(s => s.key === key) ? sectionLabel(scope, entry, key) : null
    }
    return null
  }

  function parseProposals(reply: string): ProposalDraft[] {
    const out: ProposalDraft[] = []
    const pattern = new RegExp(SECTION_UPDATE_PATTERN.source, SECTION_UPDATE_PATTERN.flags)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(reply))) {
      const slug = (match[1] ?? '').trim() || scopedSlug
      const key = (match[2] ?? '').trim()
      const content = (match[4] ?? '').trim()
      const entry = slug ? bySlug.get(slug) : undefined
      const definition = entry?.sections.find(s => s.key === key)
      if (!entry || !definition) continue
      out.push({
        portfolio_slug: entry.portfolio.slug,
        portfolio_name: entry.portfolio.name,
        section_key: key,
        section_title: definition.title,
        current_content: entry.content.get(key) ?? '',
        proposed_content: content
      })
    }
    return out
  }

  return { system, tools, onToolCall, contextLoaded, parseProposals, describeToolCall }
}
