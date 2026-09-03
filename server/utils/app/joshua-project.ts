import { useRuntimeConfig } from '#imports'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

/**
 * Joshua Project people group search.
 *
 * The JP API (api.joshuaproject.net v1) has no free-text name-search
 * parameter — only coded filters — so the full people-groups dataset is paged
 * into an in-memory cache (refreshed daily) and searched locally. The dataset
 * is also mirrored to a disk cache so a restarted/rebuilt server (dev HMR
 * wipes module state) serves JP results immediately instead of IMB-only for
 * the minutes a full API load takes.
 */

export interface JoshuaProjectGroup {
  jp_people_id: string
  jp_rop3: string | null
  name: string
  country: string | null
  country_code: string | null
  population: number | null
  religion: string | null
  language_name: string | null
  language_code: string | null
  photo_url: string | null
  latitude: number | null
  longitude: number | null
  // JP's IndigenousCode (Y/N); null when the source (or an older disk cache)
  // doesn't carry it.
  indigenous: boolean | null
}

const JP_API_BASE = 'https://api.joshuaproject.net/v1'
// The JP origin times out (Cloudflare 522) on large pages; 100 rows returns
// in ~1.5s reliably.
const PAGE_LIMIT = 100
const MAX_PAGES = 300
const PAGE_CONCURRENCY = 3
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_FILE = join(process.cwd(), 'data', 'tmp', 'jp-people-groups.json')

let cache: JoshuaProjectGroup[] | null = null
let cacheLoadedAt = 0
let loadingPromise: Promise<JoshuaProjectGroup[]> | null = null
let diskCacheChecked = false

function toNumberOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

function mapJpRow(row: Record<string, any>): JoshuaProjectGroup | null {
  const name = row.PeopNameInCountry || row.PeopName
  const id = row.PeopleID3
  if (!name || id == null) return null
  return {
    jp_people_id: String(id),
    jp_rop3: row.ROP3 != null ? String(row.ROP3) : null,
    name: String(name),
    country: row.Ctry ? String(row.Ctry) : null,
    country_code: row.ROG3 ? String(row.ROG3) : null,
    population: toNumberOrNull(row.Population),
    religion: row.PrimaryReligion ? String(row.PrimaryReligion) : null,
    language_name: row.PrimaryLanguageName ? String(row.PrimaryLanguageName) : null,
    language_code: row.ROL3 ? String(row.ROL3) : null,
    photo_url: row.PeopleGroupPhotoURL ? String(row.PeopleGroupPhotoURL) : null,
    latitude: toNumberOrNull(row.Latitude),
    longitude: toNumberOrNull(row.Longitude),
    indigenous:
      String(row.IndigenousCode).toUpperCase() === 'Y'
        ? true
        : String(row.IndigenousCode).toUpperCase() === 'N'
          ? false
          : null
  }
}

async function fetchJpPage(apiKey: string, page: number): Promise<Record<string, any>[]> {
  const url = `${JP_API_BASE}/people_groups.json?api_key=${encodeURIComponent(apiKey)}&limit=${PAGE_LIMIT}&page=${page}`
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(url)
    if (response.ok) {
      const rows = (await response.json()) as Record<string, any>[]
      return Array.isArray(rows) ? rows : []
    }
    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    } else {
      throw new Error(`Joshua Project API error: ${response.status} ${response.statusText}`)
    }
  }
  return []
}

async function fetchAllJpGroups(apiKey: string): Promise<JoshuaProjectGroup[]> {
  const all: JoshuaProjectGroup[] = []
  let page = 1
  let done = false
  while (!done && page <= MAX_PAGES) {
    const batch = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => page + i)
    page += PAGE_CONCURRENCY
    const results = await Promise.all(batch.map((p) => fetchJpPage(apiKey, p)))
    for (const rows of results) {
      if (rows.length < PAGE_LIMIT) done = true
      for (const row of rows) {
        const mapped = mapJpRow(row)
        if (mapped) all.push(mapped)
      }
    }
  }
  return all
}

async function readDiskCache(): Promise<void> {
  try {
    const text = await readFile(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(text) as { loaded_at: number; groups: JoshuaProjectGroup[] }
    if (Array.isArray(parsed.groups) && parsed.groups.length > 0) {
      cache = parsed.groups
      cacheLoadedAt = parsed.loaded_at || 0
    }
  } catch {
    // No disk cache yet (or unreadable) — the API load will create one.
  }
}

async function writeDiskCache(groups: JoshuaProjectGroup[], loadedAt: number): Promise<void> {
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify({ loaded_at: loadedAt, groups }))
  } catch (error) {
    console.error('Failed to write Joshua Project disk cache:', error)
  }
}

function startLoad(apiKey: string): void {
  if (loadingPromise) return
  loadingPromise = fetchAllJpGroups(apiKey)
    .then((data) => {
      if (data.length > 0) {
        cache = data
        cacheLoadedAt = Date.now()
        void writeDiskCache(data, cacheLoadedAt)
      }
      return data
    })
    .finally(() => {
      loadingPromise = null
    })
  loadingPromise.catch((error) => {
    console.error('Joshua Project dataset load failed:', error)
  })
}

/**
 * Never blocks on the API: a full load takes a while (~175 paged requests),
 * so a cold cache is first hydrated from the disk mirror (instant), and only
 * a missing/stale cache kicks off a background API load — searches show
 * IMB-only results until it fills. A stale cache is served while refreshing.
 * Use warmJoshuaProjectCache() at startup to preload.
 */
async function getJpDataset(): Promise<JoshuaProjectGroup[]> {
  if (process.env.VITEST) return []
  const apiKey = useRuntimeConfig().joshuaProjectApiKey
  if (!apiKey) return []

  if (!cache && !diskCacheChecked) {
    diskCacheChecked = true
    await readDiskCache()
  }

  const fresh = cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS
  if (!fresh) startLoad(apiKey)
  return cache ?? []
}

/**
 * Preload the cache (disk first, background API load only when stale).
 * No-op without a configured key.
 */
export function warmJoshuaProjectCache(): void {
  void getJpDataset()
}

export async function searchJoshuaProject(query: string, limit = 20): Promise<JoshuaProjectGroup[]> {
  const dataset = await getJpDataset()
  const q = query.toLowerCase()
  const results: JoshuaProjectGroup[] = []
  for (const group of dataset) {
    if (
      group.name.toLowerCase().includes(q) ||
      (group.country && group.country.toLowerCase().includes(q))
    ) {
      results.push(group)
      if (results.length >= limit) break
    }
  }
  return results
}
