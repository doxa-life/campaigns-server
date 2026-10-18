import { getSql } from '../../database/db'
import { getSuggestionImageObject, isSuggestionImageKey } from './suggestion-images'
import { uploadPublicImage } from './public-image-storage'

/**
 * Compressed copies of people group photos, for the mobile app (it caches
 * every photo it shows). Copies live in people_group_image_copies, keyed by
 * the original photo URL, and are only ever read by clients that ask for
 * compressed_image_url. people_groups, image_url, and the originals are never
 * touched. When a group's image_url changes, its new photo has no copy yet,
 * so compressed_image_url falls back to the original until the next run.
 */

// The app never draws a people group photo wider than 1024px.
const MAX_DIMENSION = 1024
const KEY_PREFIX = 'uploads/people-group-images'
const FETCH_TIMEOUT_MS = 30_000
const RETRY_AFTER = '24 hours'

// Admin-only proxy for /updates suggestion images. These URLs 401 for the
// public, so the bytes are read straight from the private bucket instead.
const SUGGESTION_PROXY_RE = /\/api\/admin\/people-group-reports\/image\/(.+)$/

/** Distinct photo URLs in use that have no copy and no recent failure. */
async function pendingSourceUrls(limit: number): Promise<string[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT DISTINCT pg.image_url
    FROM people_groups pg
    LEFT JOIN people_group_image_copies c ON c.source_url = pg.image_url
    WHERE pg.image_url IS NOT NULL
      AND pg.image_url <> ''
      AND pg.status <> 'archived'
      AND (c.source_url IS NULL OR (c.copy_url IS NULL AND c.failed_at < now() - ${RETRY_AFTER}::interval))
    ORDER BY pg.image_url
    LIMIT ${limit}
  `
  return rows.map((r: any) => r.image_url as string)
}

export async function hasPendingImageCopies(): Promise<boolean> {
  return (await pendingSourceUrls(1)).length > 0
}

async function downloadImage(url: string): Promise<Buffer | null> {
  const proxied = url.match(SUGGESTION_PROXY_RE)?.[1]
  if (proxied) {
    const key = decodeURIComponent(proxied)
    if (!isSuggestionImageKey(key)) return null
    return (await getSuggestionImageObject(key))?.data ?? null
  }
  if (!/^https?:\/\//.test(url)) return null

  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) return null
  return Buffer.from(await response.arrayBuffer())
}

/** Make compressed copies for up to `limit` distinct photos. */
export async function makePeopleGroupImageCopies(limit = 50): Promise<{ copied: number, failed: number }> {
  const sql = getSql()
  const sourceUrls = await pendingSourceUrls(limit)
  let copied = 0
  let failed = 0

  for (const sourceUrl of sourceUrls) {
    try {
      const data = await downloadImage(sourceUrl)
      if (!data) throw new Error('download failed')
      const { url } = await uploadPublicImage(data, {
        compress: { maxDimension: MAX_DIMENSION },
        prefix: KEY_PREFIX,
        cacheControl: 'public, max-age=31536000, immutable',
      })
      await sql`
        INSERT INTO people_group_image_copies (source_url, copy_url)
        VALUES (${sourceUrl}, ${url})
        ON CONFLICT (source_url) DO UPDATE SET copy_url = EXCLUDED.copy_url, failed_at = NULL
      `
      copied++
    } catch (error: any) {
      failed++
      console.error(`Compressed image copy failed for ${sourceUrl}:`, error?.message || error)
      await sql`
        INSERT INTO people_group_image_copies (source_url, failed_at)
        VALUES (${sourceUrl}, now())
        ON CONFLICT (source_url) DO UPDATE SET failed_at = now()
      `
    }
  }

  return { copied, failed }
}

/**
 * Compressed copy of one photo, or the photo itself while it has none. Never
 * throws: these lookups sit on public endpoints the website also uses, so any
 * failure (table missing, DB hiccup) degrades to the original photo.
 */
export async function compressedImageUrl(imageUrl: string | null | undefined): Promise<string | null> {
  if (!imageUrl) return null
  try {
    const sql = getSql()
    const [row] = await sql`
      SELECT copy_url FROM people_group_image_copies
      WHERE source_url = ${imageUrl} AND copy_url IS NOT NULL
    `
    return row?.copy_url ?? imageUrl
  } catch (error) {
    console.error('Compressed image lookup failed:', error)
    return imageUrl
  }
}

/** Every finished copy, keyed by original photo URL (for list endpoints). Empty on failure. */
export async function compressedImageUrlMap(): Promise<Map<string, string>> {
  try {
    const sql = getSql()
    const rows = await sql`SELECT source_url, copy_url FROM people_group_image_copies WHERE copy_url IS NOT NULL`
    return new Map(rows.map((r: any) => [r.source_url as string, r.copy_url as string]))
  } catch (error) {
    console.error('Compressed image lookup failed:', error)
    return new Map()
  }
}
