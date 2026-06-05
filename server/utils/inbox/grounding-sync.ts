import { groundingDocumentService } from '#server/database/grounding-documents'
import { resetGroundingCache } from './ai-draft-grounding'

// doxa.life CMS pages that ground inbox drafting. Slugs map to
// `${marketingSiteUrl}/api/pages/<slug>?locale=en`, which returns { title, body_html }.
const DOXA_PAGE_SLUGS = [
  'about/faq',
  'about',
  'about/definitions',
  'about/vision',
  'pray',
  'adopt',
  'research',
  'resources',
]

// Rendered Tiptap HTML → readable plain text for grounding. Keeps block breaks,
// drops tags, decodes the common entities the CMS emits.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/div|\/tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export interface GroundingSyncResult {
  synced: string[]
  failed: { slug: string; error: string }[]
}

/**
 * Pull the configured doxa.life pages and snapshot them into grounding_documents.
 * Resilient: a failed page doesn't abort the run, and the previous snapshot stays
 * in place so drafting keeps working when the marketing site is unreachable.
 */
export async function syncGroundingDocuments(): Promise<GroundingSyncResult> {
  const config = useRuntimeConfig()
  const base = (config.marketingSiteUrl || 'https://doxa.life').replace(/\/$/, '')
  const synced: string[] = []
  const failed: { slug: string; error: string }[] = []

  for (const slug of DOXA_PAGE_SLUGS) {
    try {
      const page = await $fetch<{ title?: string; body_html?: string }>(
        `${base}/api/pages/${slug}`,
        { query: { locale: 'en' }, timeout: 10000 }
      )
      const text = htmlToPlainText(page?.body_html || '')
      if (!text) {
        failed.push({ slug, error: 'empty body' })
        continue
      }
      await groundingDocumentService.upsert({
        source: 'doxa_page',
        doc_key: slug,
        title: page?.title || slug,
        body_text: text,
      })
      synced.push(slug)
    } catch (err: any) {
      failed.push({ slug, error: err?.message || String(err) })
    }
  }

  resetGroundingCache()
  return { synced, failed }
}
