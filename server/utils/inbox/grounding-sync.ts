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

// Synthetic doc_key (not a real CMS page) for the per-country pages list, snapshotted
// from `${marketingSiteUrl}/api/countries` so the AI can link a contact to the page for
// their country. Stored under the same 'doxa_page' source so it rides the existing
// static-pack rendering, cache key, and prune set.
const COUNTRIES_DOC_KEY = 'countries'

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
  pruned: number
}

// Deterministic offline page source under VITEST (mirroring the model-call stubs in
// ai-draft.ts / ai-knowledge-extract.ts) so the upsert/prune flow and the refresh
// endpoint stay testable without HTTP to the marketing site.
async function fetchPage(base: string, slug: string): Promise<{ title?: string; body_html?: string }> {
  if (process.env.VITEST) {
    return { title: `Stub: ${slug}`, body_html: `<p>Stubbed marketing content for ${slug}.</p>` }
  }
  return await $fetch<{ title?: string; body_html?: string }>(
    `${base}/api/pages/${slug}`,
    { query: { locale: 'en' }, timeout: 10000 }
  )
}

// One summary per country that has people groups, as returned by the marketing site's
// /api/countries (slug + English name + count are all we use here).
interface CountrySummary {
  slug: string
  name: string
  count: number
}

// Same VITEST short-circuit as fetchPage: a small deterministic country set so the
// sync's upsert and the refresh endpoint stay testable offline.
async function fetchCountries(base: string): Promise<CountrySummary[]> {
  if (process.env.VITEST) {
    return [
      { slug: 'india', name: 'India', count: 3 },
      { slug: 'niger', name: 'Niger', count: 2 },
    ]
  }
  const data = await $fetch<{ countries?: CountrySummary[] }>(
    `${base}/api/countries`,
    { query: { lang: 'en' }, timeout: 10000 }
  )
  return data?.countries ?? []
}

// Render the country list as the grounding doc body: a lead line telling the AI what
// the resource is and when to use it, then one linkable line per country.
function buildCountriesBody(base: string, countries: CountrySummary[]): string {
  const lead = 'Every country that has people groups has its own page at '
    + 'doxa.life/countries/<slug> showing a map and the list of its people groups. '
    + 'When a contact asks which people groups are in their country — or how to find or '
    + 'pray for the people groups of a specific country — link them to the matching page below.'
  const lines = [...countries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => `- ${c.name} — ${base}/countries/${c.slug} (${c.count} people groups)`)
  return `${lead}\n\n${lines.join('\n')}`
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
      const page = await fetchPage(base, slug)
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

  // Per-country pages list. Same resilience as the pages above: a failure leaves the
  // previous snapshot in place rather than aborting the run.
  try {
    const countries = await fetchCountries(base)
    if (!countries.length) {
      failed.push({ slug: COUNTRIES_DOC_KEY, error: 'no countries returned' })
    } else {
      await groundingDocumentService.upsert({
        source: 'doxa_page',
        doc_key: COUNTRIES_DOC_KEY,
        title: 'People groups by country (country pages)',
        body_text: buildCountriesBody(base, countries),
      })
      synced.push(COUNTRIES_DOC_KEY)
    }
  } catch (err: any) {
    failed.push({ slug: COUNTRIES_DOC_KEY, error: err?.message || String(err) })
  }

  // Snapshots of slugs no longer in the configured list stop grounding drafts. Failed
  // fetches are unaffected — their slug is still listed, so the old snapshot stays.
  const pruned = await groundingDocumentService.deleteKeysNotIn('doxa_page', [...DOXA_PAGE_SLUGS, COUNTRIES_DOC_KEY])

  resetGroundingCache()
  return { synced, failed, pruned }
}
