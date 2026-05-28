#!/usr/bin/env tsx
/**
 * Import "God's heart for the nations" CSV into library 10.
 *
 * Structure per day:
 *   1. Verse block (column 1 reference, fetched from Bible API)
 *   2. Paragraph (column 3 prompt)
 *
 * Usage: bun run scripts/import-uupg-csv.ts
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

const LIBRARY_ID = parseInt(process.env.LIBRARY_ID || '10')
const CSV_PATH = join(process.cwd(), 'wip/libraries/Doxa Prayer Content Template - random UUPG - God\'s heart for the nations.csv')
const BIBLE_ID = 'NKJV'

// ---------------------------------------------------------------------------
// Bible book lookup
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

/** Strip "NKJV" / "NIV" etc. from end of reference */
function cleanReference(ref: string): string {
  return ref.replace(/\s+(NKJV|NIV|ESV|KJV|NASB|NLT|MSG)$/i, '').trim()
}

/** Normalize Roman numeral prefixes: "I Timothy" → "1 Timothy" */
function normalizeReference(ref: string): string {
  return ref
    .replace(/^III\s+/i, '3 ')
    .replace(/^II\s+/i, '2 ')
    .replace(/^I\s+/i, '1 ')
}

function parseReference(reference: string) {
  const trimmed = normalizeReference(cleanReference(reference))
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

  // Skip header row (row 0); empty row is already filtered out
  return rows.slice(1).map(r => ({
    reference: (r[0] || '').trim(),
    verse: (r[1] || '').trim(),
    prompt: (r[2] || '').trim(),
  })).filter(r => r.reference && r.prompt)
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
// Tiptap JSON builder — no heading, just verse + prompt
// ---------------------------------------------------------------------------
function buildContentJson(reference: string, verseText: string, prompt: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'verse',
        attrs: { reference: cleanReference(reference) },
        content: [
          {
            type: 'paragraph',
            content: verseText ? [{ type: 'text', text: verseText }] : [],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  }
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

  console.log(`Reading CSV: ${CSV_PATH}`)
  const csvText = readFileSync(CSV_PATH, 'utf-8')
  const rows = parseCSV(csvText)
  console.log(`Parsed ${rows.length} data rows`)

  const sql = postgres(databaseUrl, { max: 5 })

  try {
    await sql`SELECT NOW()`
    console.log('Database connected')

    console.log('Verifying Bolls Bible API...')
    const testRes = await fetch(`https://bolls.life/get-text/${BIBLE_ID}/43/3/`)
    if (!testRes.ok) throw new Error(`Bolls API test failed: ${testRes.status}`)
    console.log('Bolls Bible API OK.\n')

    let created = 0
    let failed = 0

    const totalDays = Math.min(rows.length, 365)
    for (let i = 0; i < totalDays; i++) {
      const row = rows[i]
      const dayNumber = i + 1

      console.log(`Day ${dayNumber}: ${row.reference}`)

      const verseText = await fetchVerseText(row.reference)
      if (verseText) {
        console.log(`  Verse OK (${verseText.length} chars)`)
      } else {
        console.warn(`  WARN: No verse text for "${row.reference}"`)
      }

      const contentJson = buildContentJson(row.reference, verseText || '', row.prompt)

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

      // Throttle to stay under Bolls API rate limit (256 req/min)
      await new Promise(r => setTimeout(r, 250))
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
