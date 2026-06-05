import { promises as fs } from 'node:fs'
import path from 'node:path'
import { inboxKnowledgeService } from '#server/database/inbox-knowledge'
import { groundingDocumentService } from '#server/database/grounding-documents'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupAdoptionService } from '#server/database/people-group-adoptions'

// The static pack rarely changes, so cache it in process memory with a short TTL
// (picks up edits in dev, cheap in prod). The refresh endpoint can force a rebuild.
const STATIC_PACK_TTL_MS = 10 * 60 * 1000
let staticPackCache: { text: string; builtAt: number } | null = null

const FEATURE_DOCS_DIR = 'documentation/feature-descriptions'
const TONE_GUIDE_PATH = 'server/utils/inbox/ai-draft-tone-guide.md'

async function readFileSafe(relPath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(process.cwd(), relPath), 'utf8')
  } catch {
    return null
  }
}

// Recursively collect *.md files under a directory (feature-descriptions has subfolders).
async function collectMarkdown(relDir: string): Promise<{ rel: string; body: string }[]> {
  const root = path.join(process.cwd(), relDir)
  const out: { rel: string; body: string }[] = []
  async function walk(dir: string) {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith('.md')) {
        const body = await fs.readFile(full, 'utf8').catch(() => '')
        if (body.trim()) out.push({ rel: path.relative(root, full), body })
      }
    }
  }
  await walk(root)
  out.sort((a, b) => a.rel.localeCompare(b.rel))
  return out
}

export function resetGroundingCache(): void {
  staticPackCache = null
}

/**
 * The static grounding pack: tone guide + cached doxa.life CMS pages + the app's
 * feature descriptions. This block is identical across requests, so it's the part
 * we mark cacheable on the Anthropic call.
 */
export async function getStaticPack(): Promise<string> {
  if (staticPackCache && Date.now() - staticPackCache.builtAt < STATIC_PACK_TTL_MS) {
    return staticPackCache.text
  }

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

  // App feature descriptions — how the platform actually works.
  const docs = await collectMarkdown(FEATURE_DOCS_DIR)
  if (docs.length) {
    const body = docs.map(d => `## ${d.rel}\n\n${d.body.trim()}`).join('\n\n')
    sections.push(`# HOW THE DOXA PLATFORM WORKS (internal feature reference)\n\n${body}`)
  }

  const text = sections.join('\n\n---\n\n')
  staticPackCache = { text, builtAt: Date.now() }
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

  const lines: string[] = []
  lines.push(`Name: ${sub.name || 'Unknown'}`)
  lines.push(`Preferred language: ${sub.preferred_language || 'en'}`)
  if (sub.country) lines.push(`Country: ${sub.country}`)
  if (sub.primary_email) lines.push(`Primary email: ${sub.primary_email}`)
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
