import { promises as fs } from 'node:fs'
import path from 'node:path'
import { inboxKnowledgeService } from '#server/database/inbox-knowledge'
import { groundingDocumentService } from '#server/database/grounding-documents'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupAdoptionService } from '#server/database/people-group-adoptions'
import { getPortfolioBySlug, contextDb } from '#server/database/context-portfolios'
import { getPortfolioSections } from '#server/database/context-sections'

// The static pack rarely changes, so cache it in process memory. groundingKey is the
// cross-instance invalidation signal (see groundingFreshnessKey): a grounding sync or
// a feature-portfolio edit on ANY instance changes it, and the cache-hit path checks
// it so other instances rebuild on their next draft instead of serving stale content.
// The TTL covers the filesystem-sourced tone guide in dev.
const STATIC_PACK_TTL_MS = 10 * 60 * 1000
let staticPackCache: { text: string; builtAt: number; groundingKey: string | null } | null = null

// Slug of the context portfolio whose sections describe the platform feature by feature.
const FEATURE_DOCS_PORTFOLIO_SLUG = 'doxa-features'
const TONE_GUIDE_PATH = 'server/utils/inbox/ai-draft-tone-guide.md'

async function readFileSafe(relPath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(process.cwd(), relPath), 'utf8')
  } catch {
    return null
  }
}

/** The feature portfolio's sections that have content, in display order. */
async function collectFeatureDocs(): Promise<{ title: string; body: string }[]> {
  const sql = contextDb()
  const portfolio = await getPortfolioBySlug(FEATURE_DOCS_PORTFOLIO_SLUG, sql)
  if (!portfolio) return []
  const definitions = await getPortfolioSections(portfolio.id, sql)
  const rows = await sql`
    SELECT section_key, content FROM context_sections WHERE portfolio_id = ${portfolio.id}
  ` as unknown as Array<{ section_key: string; content: string }>
  const byKey = new Map(rows.map(r => [r.section_key, r.content]))
  return definitions
    .map(d => ({ title: d.title, body: (byKey.get(d.key) ?? '').trim() }))
    .filter(d => d.body)
}

/**
 * Freshness key for the cached pack: the latest doxa.life snapshot and the latest
 * edit to any section of the feature portfolio.
 */
async function groundingFreshnessKey(): Promise<string> {
  const sql = contextDb()
  const [pages, portfolio] = await Promise.all([
    groundingDocumentService.latestFetchedAt('doxa_page'),
    getPortfolioBySlug(FEATURE_DOCS_PORTFOLIO_SLUG, sql),
  ])
  let docs: string | null = null
  if (portfolio) {
    const [row] = await sql`
      SELECT max(last_edited_at) AS latest FROM context_sections WHERE portfolio_id = ${portfolio.id}
    ` as unknown as Array<{ latest: unknown }>
    docs = row?.latest == null ? null : String(row.latest)
  }
  return `${pages ?? ''}|${docs ?? ''}`
}

export function resetGroundingCache(): void {
  staticPackCache = null
}

/**
 * The static grounding pack: tone guide + cached doxa.life CMS pages + the feature
 * portfolio's sections. This block is identical across requests, so it's the part
 * we mark cacheable on the AI call.
 */
export async function getStaticPack(): Promise<string> {
  if (staticPackCache && Date.now() - staticPackCache.builtAt < STATIC_PACK_TTL_MS) {
    // Serve the cache only while the DB content is unchanged. If the freshness
    // check itself fails, serve the cache rather than rebuilding from a flaky DB.
    const latest = await groundingFreshnessKey().catch(() => undefined)
    if (latest === undefined || latest === staticPackCache.groundingKey) {
      return staticPackCache.text
    }
  }

  // Read before the content: a sync or edit landing mid-build makes the stored key
  // stale, which triggers a rebuild on the next draft rather than being missed.
  const groundingKey = await groundingFreshnessKey().catch(() => null)

  const sections: string[] = []

  const tone = await readFileSafe(TONE_GUIDE_PATH)
  if (tone) sections.push(`# VOICE & TONE GUIDE\n\n${tone.trim()}`)

  // doxa.life pages (FAQ, about, definitions, etc.) snapshotted into grounding_documents.
  const pages = await groundingDocumentService.list('doxa_page').catch(() => [])
  if (pages.length) {
    const body = pages
      .map(p => `## ${p.title || p.doc_key} (doxa.life/${p.doc_key})\n\n${p.body_text.trim()}`)
      .join('\n\n')
    sections.push(`# DOXA.LIFE WEBSITE CONTENT\n\n${body}`)
  }

  // Feature portfolio sections — how the platform actually works.
  const docs = await collectFeatureDocs().catch(() => [])
  if (docs.length) {
    const body = docs.map(d => `## ${d.title}\n\n${d.body}`).join('\n\n')
    sections.push(`# HOW THE DOXA PLATFORM WORKS (internal feature reference)\n\n${body}`)
  }

  const text = sections.join('\n\n---\n\n')
  staticPackCache = { text, builtAt: Date.now(), groundingKey }
  return text
}

/**
 * Captured Q&A knowledge base — real (anonymised) answers the team has given.
 * Reference material the AI learns from; never sent verbatim. Separate cache block
 * because it changes when entries are added.
 */
export async function getKnowledgeBlock(): Promise<string> {
  const entries = await inboxKnowledgeService.listActive().catch(() => [])
  if (!entries.length) return ''
  const body = entries
    .map((e, i) => `### Q${i + 1} (${e.language})\nQ: ${e.question.trim()}\nA: ${e.answer.trim()}`)
    .join('\n\n')
  return `# PAST ANSWERS FROM THE TEAM (anonymised — reference, do not paste verbatim)\n\n${body}`
}

/**
 * The contact's live record for this conversation: profile, subscriptions, prayer
 * activity, and real adoption status (via groups where they are primary contact).
 * Per-request, so this is NOT part of the cached prefix.
 */
export async function formatContactRecord(subscriberId: number | null | undefined): Promise<string> {
  if (!subscriberId) {
    return 'No linked contact record (the sender is not a known subscriber).'
  }

  const sub = await subscriberService.getSubscriberWithSubscriptions(subscriberId).catch(() => null)
  if (!sub) return 'No linked contact record found for this conversation.'

  // Data minimization: the contact's email address is deliberately not included —
  // the email system addresses the reply, so the model has no use for it.
  const lines: string[] = []
  lines.push(`Name: ${sub.name || 'Unknown'}`)
  lines.push(`Preferred language: ${sub.preferred_language || 'en'}`)
  if (sub.country) lines.push(`Country: ${sub.country}`)
  lines.push(`Prayer activity: ${sub.prayer_session_count} sessions, ${sub.total_prayer_minutes} minutes total`)

  if (sub.subscriptions?.length) {
    const subs = sub.subscriptions
      .map(s => `  - ${s.people_group_name} (${s.status}, ${s.frequency} via ${s.delivery_method})`)
      .join('\n')
    lines.push(`People-group subscriptions:\n${subs}`)
  } else {
    lines.push('People-group subscriptions: none')
  }

  const adoptions = await peopleGroupAdoptionService
    .getForSubscriberAsPrimaryContact(subscriberId)
    .catch(() => [])
  if (adoptions.length) {
    const ad = adoptions
      .map(a => `  - ${a.group_name} → ${a.people_group_name}: ${a.status}`)
      .join('\n')
    lines.push(`Adoptions (groups where this contact is the primary contact):\n${ad}`)
  } else {
    lines.push('Adoptions (as primary contact): none')
  }

  return lines.join('\n')
}
