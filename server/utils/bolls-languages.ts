/**
 * Bolls.life translation catalog.
 *
 * A glossary language records which Bible translation its reviewers' churches
 * actually use. Most of the time that edition is one bolls.life already serves,
 * so the review page offers the catalog for that language; a language bolls
 * does not carry yet comes back with an empty list and the reviewer names their
 * edition in free text instead.
 */

const CATALOG_URL = 'https://bolls.life/static/bolls/app/views/languages.json'

/** How long the fetched catalog is reused. It changes a few times a year. */
const CATALOG_CACHE_MS = 24 * 60 * 60 * 1000

export interface BollsTranslation {
  short_name: string
  full_name: string
}

interface BollsLanguageGroup {
  language: string
  translations: BollsTranslation[]
}

let cache: { groups: BollsLanguageGroup[]; expires: number } | null = null

async function loadCatalog(): Promise<BollsLanguageGroup[]> {
  if (cache && cache.expires > Date.now()) return cache.groups

  let groups: BollsLanguageGroup[] = []
  try {
    const response = await fetch(CATALOG_URL)
    if (!response.ok) throw new Error(`bolls.life returned ${response.status}`)
    const data = await response.json()
    groups = (Array.isArray(data) ? data : []).map((group: any) => ({
      language: String(group?.language ?? ''),
      translations: (Array.isArray(group?.translations) ? group.translations : [])
        .map((translation: any) => ({
          short_name: String(translation?.short_name ?? ''),
          full_name: String(translation?.full_name ?? '')
        }))
        .filter((translation: BollsTranslation) => translation.short_name)
    }))
  } catch (e: any) {
    // The catalog is a convenience for one dropdown; a fetch failure must not
    // block the review page, so the stale copy stands and the field falls back
    // to free text.
    console.warn(`[Bolls] could not load the translation catalog: ${e?.message}`)
    return cache?.groups ?? []
  }

  cache = { groups, expires: Date.now() + CATALOG_CACHE_MS }
  return groups
}

/**
 * Whether a catalog entry is the language named in English.
 *
 * Catalog names pair the English name with the endonym and are not
 * consistently capitalised — "Romanian Română", "Chinese 中文", "russian
 * русский" — and one entry covers two languages, "Latin / Italian". Matching
 * treats the name as a set of words so each of those resolves.
 */
export function matchesLanguage(catalogName: string, languageNameEn: string): boolean {
  const wanted = languageNameEn.trim().toLowerCase()
  if (!wanted) return false

  const name = catalogName.trim().toLowerCase()
  if (name === wanted) return true
  if (name.split(/[\s/]+/).includes(wanted)) return true

  // A multi-word name ("Simplified Chinese") only ever appears at the start.
  return wanted.includes(' ') && name.startsWith(wanted)
}

/**
 * Editions bolls.life carries for a language, matched on its English name.
 * Returns an empty list for a language bolls does not carry.
 */
export async function getBollsTranslations(languageNameEn: string): Promise<BollsTranslation[]> {
  const groups = await loadCatalog()
  const group = groups.find(candidate => matchesLanguage(candidate.language, languageNameEn))
  return group?.translations ?? []
}
