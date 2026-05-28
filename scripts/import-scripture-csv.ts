#!/usr/bin/env tsx
/**
 * Import Scripture CSV into library 4 using direct DB + Bolls Bible API.
 *
 * Usage: bun run scripts/import-scripture-csv.ts
 *
 * Options (env vars):
 *   LIBRARY_ID  - Library to import into (default: 4)
 *   DRY_RUN     - Set to "true" to preview without creating content
 */

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

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

const LIBRARY_ID = parseInt(process.env.LIBRARY_ID || '4')
const CSV_PATH = join(process.cwd(), 'wip/libraries/Doxa Prayer Content Template - scripture content.csv')
const DRY_RUN = process.env.DRY_RUN === 'true'
const BIBLE_ID = 'NKJV'

// ---------------------------------------------------------------------------
// Bible book lookup (subset needed for this CSV)
// ---------------------------------------------------------------------------
const BOOK_LOOKUP: Record<string, string> = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM',
  deuteronomy: 'DEU', joshua: 'JOS', judges: 'JDG', ruth: 'RUT',
  '1 samuel': '1SA', '2 samuel': '2SA', '1 kings': '1KI', '2 kings': '2KI',
  '1 chronicles': '1CH', '2 chronicles': '2CH', ezra: 'EZR', nehemiah: 'NEH',
  esther: 'EST', job: 'JOB', psalms: 'PSA', psalm: 'PSA', ps: 'PSA',
  proverbs: 'PRO', ecclesiastes: 'ECC', 'song of solomon': 'SNG',
  isaiah: 'ISA', jeremiah: 'JER', lamentations: 'LAM', ezekiel: 'EZK',
  daniel: 'DAN', hosea: 'HOS', joel: 'JOL', amos: 'AMO', obadiah: 'OBA',
  jonah: 'JON', micah: 'MIC', nahum: 'NAM', habakkuk: 'HAB',
  zephaniah: 'ZEP', haggai: 'HAG', zechariah: 'ZEC', malachi: 'MAL',
  matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN',
  acts: 'ACT', romans: 'ROM',
  '1 corinthians': '1CO', '2 corinthians': '2CO',
  galatians: 'GAL', ephesians: 'EPH', philippians: 'PHP', colossians: 'COL',
  '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI',
  titus: 'TIT', philemon: 'PHM', hebrews: 'HEB', james: 'JAS',
  '1 peter': '1PE', '2 peter': '2PE',
  '1 john': '1JN', '2 john': '2JN', '3 john': '3JN',
  jude: 'JUD', revelation: 'REV',
}

// USFM book code → Bolls.life book number (standard Protestant canon, 1-66)
const USFM_TO_BOOK_NUMBER: Record<string, number> = {
  GEN: 1, EXO: 2, LEV: 3, NUM: 4, DEU: 5,
  JOS: 6, JDG: 7, RUT: 8, '1SA': 9, '2SA': 10,
  '1KI': 11, '2KI': 12, '1CH': 13, '2CH': 14, EZR: 15,
  NEH: 16, EST: 17, JOB: 18, PSA: 19, PRO: 20,
  ECC: 21, SNG: 22, ISA: 23, JER: 24, LAM: 25,
  EZK: 26, DAN: 27, HOS: 28, JOL: 29, AMO: 30,
  OBA: 31, JON: 32, MIC: 33, NAM: 34, HAB: 35,
  ZEP: 36, HAG: 37, ZEC: 38, MAL: 39,
  MAT: 40, MRK: 41, LUK: 42, JHN: 43, ACT: 44,
  ROM: 45, '1CO': 46, '2CO': 47, GAL: 48, EPH: 49,
  PHP: 50, COL: 51, '1TH': 52, '2TH': 53, '1TI': 54,
  '2TI': 55, TIT: 56, PHM: 57, HEB: 58, JAS: 59,
  '1PE': 60, '2PE': 61, '1JN': 62, '2JN': 63, '3JN': 64,
  JUD: 65, REV: 66,
}

function parseReference(reference: string) {
  const trimmed = reference.trim()
  const match = trimmed.match(/^(\d?\s*[a-zA-Z][a-zA-Z\s]*?)\s+(\d+)(?::(\d+)(?:\s*[-–—]\s*(\d+))?)?$/)
  if (!match) return null
  const bookName = match[1].trim().toLowerCase()
  const chapter = parseInt(match[2], 10)
  const verseStart = match[3] ? parseInt(match[3], 10) : undefined
  const verseEnd = match[4] ? parseInt(match[4], 10) : undefined
  const bookId = BOOK_LOOKUP[bookName]
  if (!bookId) return null
  return { bookId, chapter, verseStart, verseEnd }
}

// ---------------------------------------------------------------------------
// CSV parser (handles quoted multiline fields)
// ---------------------------------------------------------------------------
interface CsvRow {
  date: string
  title: string
  reference: string
  verse: string
  prompt: string
}

function parseCSV(text: string): CsvRow[] {
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

  return rows.slice(1).map(r => ({
    date: (r[0] || '').trim(),
    title: (r[1] || '').trim(),
    reference: (r[2] || '').trim(),
    verse: (r[3] || '').trim(),
    prompt: (r[4] || '').trim(),
  })).filter(r => r.date && r.title)
}

// ---------------------------------------------------------------------------
// Bolls Bible API
// ---------------------------------------------------------------------------
async function fetchVerseText(reference: string): Promise<string | null> {
  const parsed = parseReference(reference)
  if (!parsed) {
    console.warn(`    Could not parse reference: "${reference}"`)
    return null
  }

  const bookNumber = USFM_TO_BOOK_NUMBER[parsed.bookId]
  if (!bookNumber) {
    console.warn(`    Unknown book code: "${parsed.bookId}"`)
    return null
  }

  const url = `https://bolls.life/get-text/${BIBLE_ID}/${bookNumber}/${parsed.chapter}/`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`    Bolls API error: ${res.status}`)
    return null
  }

  const verses = await res.json() as Array<{ verse: number; text: string }>

  let filtered = verses
  if (parsed.verseStart !== undefined) {
    const end = parsed.verseEnd ?? parsed.verseStart
    filtered = verses.filter(v => v.verse >= parsed.verseStart! && v.verse <= end)
  }

  if (filtered.length === 0) return null
  return filtered.map(v => v.text.replace(/<[^>]+>/g, '').replace(/\s*\[\d+\]/g, '').replace(/[\u24B6-\u24E9\u2460-\u2473]/g, '')).join(' ').trim()
}

// ---------------------------------------------------------------------------
// Tiptap JSON builder
// ---------------------------------------------------------------------------
function buildContentJson(
  title: string,
  verseBlocks: Array<{ reference: string; text: string }>,
  prompt: string,
) {
  const content: any[] = []

  content.push({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: title }],
  })

  for (const v of verseBlocks) {
    content.push({
      type: 'verse',
      attrs: { reference: v.reference },
      content: [
        {
          type: 'paragraph',
          content: v.text ? [{ type: 'text', text: v.text }] : [],
        },
      ],
    })
  }

  content.push({
    type: 'paragraph',
    content: [{ type: 'text', text: prompt }],
  })

  return { type: 'doc', content }
}

// ---------------------------------------------------------------------------
// Parse day number from "January 5" etc.
// ---------------------------------------------------------------------------
function parseDayNumber(dateStr: string): number | null {
  const match = dateStr.match(/(\w+)\s+(\d+)/)
  if (!match) return null
  const month = match[1].toLowerCase()
  const day = parseInt(match[2])
  const monthOffsets: Record<string, number> = {
    january: 0, february: 31, march: 59, april: 90,
    may: 120, june: 151, july: 181, august: 212,
    september: 243, october: 273, november: 304, december: 334,
  }
  const offset = monthOffsets[month]
  if (offset === undefined) return null
  return offset + day
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

    // Verify Bolls API
    console.log('Verifying Bolls Bible API...')
    const testRes = await fetch(`https://bolls.life/get-text/${BIBLE_ID}/43/3/`)
    if (!testRes.ok) throw new Error(`Bolls API test failed: ${testRes.status}`)
    console.log('Bolls Bible API OK.\n')

    let created = 0
    let failed = 0
    let skipped = 0

    for (const row of rows) {
      const dayNumber = parseDayNumber(row.date)
      if (!dayNumber) {
        console.warn(`Skipping - cannot parse date: "${row.date}"`)
        skipped++
        continue
      }

      console.log(`Day ${dayNumber} (${row.date}): ${row.title}`)

      // Each line in the reference column is a separate reference
      const references = row.reference.split('\n').map(r => r.trim()).filter(Boolean)

      const verseBlocks: Array<{ reference: string; text: string }> = []

      for (let vi = 0; vi < references.length; vi++) {
        const ref = references[vi]
        if (vi > 0) await new Promise(r => setTimeout(r, 250))
        console.log(`  Fetching: ${ref}`)
        const text = await fetchVerseText(ref)
        if (text) {
          verseBlocks.push({ reference: ref, text })
          console.log(`    OK (${text.length} chars)`)
        } else {
          verseBlocks.push({ reference: ref, text: '' })
          console.warn(`    WARN: No text returned for "${ref}"`)
        }
      }

      const contentJson = buildContentJson(row.title, verseBlocks, row.prompt)

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would create day ${dayNumber}`)
        created++
      } else {
        try {
          await sql`
            INSERT INTO library_content (library_id, day_number, language_code, content_json)
            VALUES (${LIBRARY_ID}, ${dayNumber}, 'en', ${JSON.stringify(contentJson)})
            ON CONFLICT (library_id, day_number, language_code) DO UPDATE SET content_json = EXCLUDED.content_json
          `
          console.log(`  Created day ${dayNumber}`)
          created++
        } catch (err: any) {
          console.error(`  FAILED day ${dayNumber}: ${err.message}`)
          failed++
        }
      }

      // Throttle to stay under Bolls API rate limit (256 req/min)
      await new Promise(r => setTimeout(r, 250))
    }

    console.log(`\nDone! Created: ${created}, Failed: ${failed}, Skipped: ${skipped}`)
  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
