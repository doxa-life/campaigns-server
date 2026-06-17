import { getSql } from './db'
import { appConfigService } from './app-config'

// The tag palette is the curated master list of inbox tags. It lives as a single
// JSON document in app_config (key below) rather than its own table — conversations
// store only tag slugs (in conversations.tags), and look up name + colour here.
const PALETTE_KEY = 'inbox_tags'

// Allowed chip colours map 1:1 to Nuxt UI theme colours so a tag renders with
// <UBadge :color="tag.color" />. Keep in sync with the swatch list the picker offers.
export const TAG_COLORS = ['neutral', 'primary', 'secondary', 'info', 'success', 'warning', 'error'] as const
export type TagColor = (typeof TAG_COLORS)[number]
const DEFAULT_COLOR: TagColor = 'neutral'

export interface InboxTag {
  slug: string
  name: string
  color: TagColor
}

// Kebab-case slug derived from the display name; this is the stable key stored on
// conversations, so a later rename of the name leaves existing assignments intact.
export function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

class InboxTagService {
  private sql = getSql()

  async list(): Promise<InboxTag[]> {
    const palette = await appConfigService.getConfig<InboxTag[]>(PALETTE_KEY)
    if (!Array.isArray(palette)) return []
    return palette
      .filter(t => t && typeof t.slug === 'string' && typeof t.name === 'string')
      .map(t => ({ slug: t.slug, name: t.name, color: TAG_COLORS.includes(t.color) ? t.color : DEFAULT_COLOR }))
  }

  async getBySlug(slug: string): Promise<InboxTag | null> {
    return (await this.list()).find(t => t.slug === slug) ?? null
  }

  // Create-or-return: if a tag with the derived slug already exists it's returned
  // unchanged, so inline create-on-assign is idempotent and never duplicates.
  async create(name: string, color: TagColor = DEFAULT_COLOR): Promise<InboxTag> {
    const cleanName = name.trim()
    const slug = slugifyTag(cleanName)
    if (!slug) throw new Error('Tag name must contain a letter or number')

    const palette = await this.list()
    const existing = palette.find(t => t.slug === slug)
    if (existing) return existing

    const tag: InboxTag = { slug, name: cleanName, color: TAG_COLORS.includes(color) ? color : DEFAULT_COLOR }
    await appConfigService.setConfig(PALETTE_KEY, [...palette, tag])
    return tag
  }

  // Remove a tag from the palette and strip its slug from every conversation that
  // carries it, so no orphaned slug is left referencing a deleted definition.
  async delete(slug: string): Promise<void> {
    const palette = await this.list()
    const next = palette.filter(t => t.slug !== slug)
    if (next.length !== palette.length) {
      await appConfigService.setConfig(PALETTE_KEY, next)
    }
    await this.sql`
      UPDATE conversations
      SET tags = tags - ${slug}, updated_at = NOW()
      WHERE tags @> ${this.sql.json([slug])}
    `
  }

  // Keep only slugs that exist in the palette, de-duplicated, preserving order.
  async sanitizeSlugs(slugs: unknown): Promise<string[]> {
    if (!Array.isArray(slugs)) return []
    const valid = new Set((await this.list()).map(t => t.slug))
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of slugs) {
      if (typeof s !== 'string') continue
      if (!valid.has(s) || seen.has(s)) continue
      seen.add(s)
      out.push(s)
    }
    return out
  }
}

export const inboxTagService = new InboxTagService()
