#!/usr/bin/env tsx
/**
 * Import prayer content CSV into a library via direct DB + cached Bolls Bible.
 * Creates new days after existing content (does not modify existing days).
 *
 * CSV format (no header): title, reference, (empty), prompt
 * Row index maps to day number starting after existing content.
 *
 * Usage: bun run scripts/import-prayer-content-csv.ts
 *
 * Options (env vars):
 *   DRY_RUN     - Set to "true" to preview without creating content
 */

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchVerseData } from '../server/utils/app/bolls-bible'
import { parseReference, localizeReference } from '../config/bible-books'

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
      if (!line || line.trim().startsWith('#')) return
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        process.env[key.trim()] = value
      }
    })
  } catch (error) {
    console.warn('Could not load .env file:', error)
  }
}

loadEnv()

const LIBRARY_ID = 3
const CSV_PATH = join(process.cwd(), 'data/tmp/Prayer content for editing - Sheet2.csv')
const DRY_RUN = process.env.DRY_RUN === 'true'
const BIBLE_ID = 'NKJV'
const BIBLE_LABEL = 'NKJV'

// ---------------------------------------------------------------------------
// CSV reference parsing — handles comma-separated verses (e.g. "Luke 10:39, 42")
// ---------------------------------------------------------------------------
function parseAllReferences(reference: string) {
  const parts = reference.split(',').map(s => s.trim())
  const results: Array<{ bookId: string; chapter: number; verseStart?: number; verseEnd?: number }> = []
  let lastBookId = '', lastChapter = 0

  for (const part of parts) {
    const parsed = parseReference(part)
    if (parsed) {
      lastBookId = parsed.bookId
      lastChapter = parsed.chapter
      results.push(parsed)
    } else {
      const verseNum = parseInt(part, 10)
      if (!isNaN(verseNum) && lastBookId) {
        results.push({ bookId: lastBookId, chapter: lastChapter, verseStart: verseNum })
      }
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Verse fetching — returns individual verses with numbers
// ---------------------------------------------------------------------------
interface VerseResult {
  verse: number
  text: string
}

async function getVerses(reference: string): Promise<{ verses: VerseResult[]; formattedRef: string } | null> {
  const refs = parseAllReferences(reference)
  if (refs.length === 0) {
    console.warn(`    Could not parse reference: "${reference}"`)
    return null
  }

  const allVerses: VerseResult[] = []
  for (const ref of refs) {
    try {
      const verses = await fetchVerseData({
        bibleId: BIBLE_ID,
        bookId: ref.bookId,
        chapter: ref.chapter,
        verseStart: ref.verseStart,
        verseEnd: ref.verseEnd,
      })
      allVerses.push(...verses)
    } catch (err: any) {
      console.warn(`    Verse fetch error for ${ref.bookId} ${ref.chapter}: ${err.message}`)
    }
  }

  if (allVerses.length === 0) return null

  // Use the first ref for the localized reference string
  const formattedRef = localizeReference(refs[0], 'en')

  return { verses: allVerses, formattedRef }
}

// ---------------------------------------------------------------------------
// CSV parser (handles quoted fields)
// ---------------------------------------------------------------------------
interface CsvRow {
  title: string
  reference: string
  prompt: string
}

function parseRawRows(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(current)
        current = ''
      } else if (char === '\n') {
        row.push(current)
        current = ''
        if (row.some(cell => cell.trim())) rows.push(row)
        row = []
      } else if (char !== '\r') {
        current += char
      }
    }
  }
  if (current || row.length > 0) {
    row.push(current)
    if (row.some(cell => cell.trim())) rows.push(row)
  }

  return rows
}

function cleanTitle(title: string): string {
  return title.replace(/\s*\(title,\s*verse,\s*then prompt\)/i, '').trim()
}

function parseCSV(text: string): CsvRow[] {
  return parseRawRows(text).map(r => ({
    title: cleanTitle((r[0] || '').trim()),
    reference: (r[1] || '').trim(),
    prompt: (r[3] || '').trim(),
  })).filter(r => r.title && r.reference)
}

// ---------------------------------------------------------------------------
// Tiptap JSON builder — matches VerseNode.vue format
// ---------------------------------------------------------------------------
function buildVerseContent(verses: VerseResult[]) {
  // Build paragraph content with superscript verse numbers, matching VerseNode.vue
  const content: any[] = []
  for (let i = 0; i < verses.length; i++) {
    const v = verses[i]
    // Verse number with superscript mark
    content.push({
      type: 'text',
      marks: [{ type: 'superscript' }],
      text: `${v.verse} `,
    })
    // Verse text (trailing space between verses, none after last)
    const text = i < verses.length - 1 ? v.text + ' ' : v.text
    content.push({
      type: 'text',
      text,
    })
  }
  return content
}

function buildPrayerNodes(
  title: string,
  reference: string,
  verses: VerseResult[] | null,
  prompt: string,
) {
  const verseContent = verses ? buildVerseContent(verses) : []

  return [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: title }],
    },
    {
      type: 'verse',
      attrs: { reference, translation: BIBLE_LABEL },
      content: [{
        type: 'paragraph',
        content: verseContent.length > 0 ? verseContent : [],
      }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: prompt }],
    },
  ]
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL not found in .env')
    process.exit(1)
  }

  const sql = postgres(databaseUrl, { max: 5 })

  try {
    await sql`SELECT NOW()`
    console.log('Database connected')

    console.log(`Reading CSV: ${CSV_PATH}`)
    const csvText = readFileSync(CSV_PATH, 'utf-8')
    const rows = parseCSV(csvText)
    console.log(`Parsed ${rows.length} rows\n`)

    if (DRY_RUN) console.log('--- DRY RUN (no content will be created) ---\n')

    // Fetch all existing English content for this library
    console.log('Fetching existing content from DB...')
    const existingRows = await sql`
      SELECT id, day_number, content_json
      FROM library_content
      WHERE library_id = ${LIBRARY_ID} AND language_code = 'en'
    `
    const existingByDay = new Map<number, { id: number; content_json: string | null }>()
    for (const row of existingRows) {
      existingByDay.set(row.day_number, { id: row.id, content_json: row.content_json })
    }
    console.log(`Found existing content for ${existingByDay.size} days`)

    // Start day numbering after existing content
    const startDay = existingByDay.size + 1
    console.log(`New content will start at day ${startDay}\n`)

    let created = 0
    let failed = 0

    for (let i = 0; i < rows.length; i++) {
      const dayNumber = startDay + i
      const row = rows[i]

      console.log(`Day ${dayNumber}: ${row.title} — ${row.reference}`)

      const result = await getVerses(row.reference)
      if (result) {
        console.log(`  Verse OK (${result.verses.length} verses, ref: ${result.formattedRef})`)
      } else {
        console.warn(`  WARN: No verse data for "${row.reference}"`)
      }

      const ref = result?.formattedRef || row.reference
      const newNodes = buildPrayerNodes(row.title, ref, result?.verses || null, row.prompt)
      const contentJson = { type: 'doc', content: newNodes }

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would create day ${dayNumber}`)
        created++
      } else {
        try {
          await sql`
            INSERT INTO library_content (library_id, day_number, language_code, content_json)
            VALUES (${LIBRARY_ID}, ${dayNumber}, 'en', ${sql.json(contentJson)})
          `
          console.log(`  Created day ${dayNumber}`)
          created++
        } catch (err: any) {
          console.error(`  FAILED to create day ${dayNumber}: ${err.message}`)
          failed++
        }
      }
    }

    console.log(`\nDone! Created: ${created}, Failed: ${failed}`)
  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
