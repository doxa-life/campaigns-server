/**
 * Bolls.life Bible API client
 * Fetches verse text using a disk-cached full-translation download from Bolls.life.
 *
 * On first request for a translation, downloads the entire Bible JSON (~7-30MB)
 * from https://bolls.life/static/translations/{bibleId}.json, strips unnecessary
 * fields, saves to data/bibles/{bibleId}.json, and builds an in-memory index
 * keyed by "book/chapter" for instant lookups.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export interface VerseData { verse: number; text: string }

export interface FetchVerseParams {
  bibleId: string
  bookId: string
  chapter: number
  verseStart?: number
  verseEnd?: number
}

interface BollsVerse {
  pk: number
  verse: number
  text: string
}

interface BollsRawVerse {
  pk: number
  book: number
  chapter: number
  verse: number
  text: string
  comment?: string
  translation?: string
}

/**
 * USFM book code → Bolls.life book number (standard Protestant canon, 1-66)
 */
export const USFM_TO_BOOK_NUMBER: Record<string, number> = {
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

// ---------------------------------------------------------------------------
// Reference remapping for translations with different numbering
// ---------------------------------------------------------------------------

interface ChapterRemap {
  book: string
  fromChapter: number
  fromVerseStart?: number // If set, only applies when verse >= this
  fromVerseEnd?: number   // If set, only applies when verse <= this
  toChapter: number
  verseOffset: number     // Added to verse numbers
}

interface TranslationMapping {
  psalmChapterOffset?: { fromChapter: number; toChapter: number; offset: number }
  psalmVerseOffset?: boolean // Auto-detect verse offset for superscription counting
  remaps?: ChapterRemap[]
}

const TRANSLATION_MAPPINGS: Record<string, TranslationMapping> = {
  SYNOD: {
    // Psalms 10-146: English psalm N = SYNOD psalm N-1
    psalmChapterOffset: { fromChapter: 10, toChapter: 146, offset: -1 },
    psalmVerseOffset: true,
    remaps: [
      // English Romans 16:25-27 → SYNOD Romans 14:24-26
      { book: 'ROM', fromChapter: 16, fromVerseStart: 25, toChapter: 14, verseOffset: -1 },
    ]
  },
  BDS: {
    psalmVerseOffset: true,
    remaps: [
      // English Joel 2:28-32 → BDS Joel 3:1-5
      { book: 'JOL', fromChapter: 2, fromVerseStart: 28, toChapter: 3, verseOffset: -27 },
      // English Joel 3:* → BDS Joel 4:*
      { book: 'JOL', fromChapter: 3, toChapter: 4, verseOffset: 0 },
      // English Malachi 4:* → BDS Malachi 3:(verse+18)
      { book: 'MAL', fromChapter: 4, toChapter: 3, verseOffset: 18 },
    ]
  },
  S00: {
    psalmVerseOffset: true,
    remaps: [
      { book: 'JOL', fromChapter: 2, fromVerseStart: 28, toChapter: 3, verseOffset: -27 },
      { book: 'JOL', fromChapter: 3, toChapter: 4, verseOffset: 0 },
      { book: 'MAL', fromChapter: 4, toChapter: 3, verseOffset: 18 },
    ]
  },
  FRLSG: {
    psalmVerseOffset: true,
    remaps: [
      { book: 'JOL', fromChapter: 2, fromVerseStart: 28, toChapter: 3, verseOffset: -27 },
      { book: 'JOL', fromChapter: 3, toChapter: 4, verseOffset: 0 },
      { book: 'MAL', fromChapter: 4, toChapter: 3, verseOffset: 18 },
    ]
  },
}

interface RemappedRef {
  chapter: number
  verseStart?: number
  verseEnd?: number
  needsPsalmVerseOffset: boolean
}

function remapReference(
  bibleId: string,
  bookId: string,
  chapter: number,
  verseStart?: number,
  verseEnd?: number
): RemappedRef {
  const mapping = TRANSLATION_MAPPINGS[bibleId]
  if (!mapping) {
    return { chapter, verseStart, verseEnd, needsPsalmVerseOffset: false }
  }

  let ch = chapter
  let vs = verseStart
  let ve = verseEnd

  // Psalm chapter offset (SYNOD: LXX numbering)
  if (mapping.psalmChapterOffset && bookId === 'PSA') {
    const { fromChapter, toChapter, offset } = mapping.psalmChapterOffset
    if (ch >= fromChapter && ch <= toChapter) {
      ch = ch + offset
      console.log(`[Bolls remap] ${bibleId} Psalm ${chapter} → Psalm ${ch}`)
    }
  }

  // Specific chapter/verse remaps
  if (mapping.remaps) {
    for (const remap of mapping.remaps) {
      if (remap.book !== bookId || remap.fromChapter !== chapter) continue

      // If remap has fromVerseStart, only apply if our verse range starts at or after it
      if (remap.fromVerseStart !== undefined) {
        if (vs === undefined || vs < remap.fromVerseStart) continue
      }
      // If remap has fromVerseEnd, only apply if our verse range starts at or before it
      if (remap.fromVerseEnd !== undefined) {
        if (vs === undefined || vs > remap.fromVerseEnd) continue
      }

      const oldCh = ch
      ch = remap.toChapter
      if (vs !== undefined) vs = vs + remap.verseOffset
      if (ve !== undefined) ve = ve + remap.verseOffset
      console.log(`[Bolls remap] ${bibleId} ${bookId} ${oldCh}:${verseStart}-${verseEnd} → ${ch}:${vs}-${ve}`)
      break
    }
  }

  const needsPsalmVerseOffset = !!(mapping.psalmVerseOffset && bookId === 'PSA')
  return { chapter: ch, verseStart: vs, verseEnd: ve, needsPsalmVerseOffset }
}

// ---------------------------------------------------------------------------
// Disk cache + in-memory index
// ---------------------------------------------------------------------------

type ChapterIndex = Map<string, BollsVerse[]>

const BIBLES_DIR = join(process.cwd(), 'data', 'bibles')

const memoryIndex = new Map<string, ChapterIndex>()
const pendingLoads = new Map<string, Promise<ChapterIndex>>()

function buildIndex(verses: BollsRawVerse[]): ChapterIndex {
  const index: ChapterIndex = new Map()
  for (const v of verses) {
    const key = `${v.book}/${v.chapter}`
    let arr = index.get(key)
    if (!arr) {
      arr = []
      index.set(key, arr)
    }
    arr.push({ pk: v.pk, verse: v.verse, text: v.text })
  }
  return index
}

async function loadTranslation(bibleId: string): Promise<ChapterIndex> {
  await mkdir(BIBLES_DIR, { recursive: true })
  const filePath = join(BIBLES_DIR, `${bibleId}.json`)

  let rawVerses: BollsRawVerse[]

  if (existsSync(filePath)) {
    console.log(`[Bolls] Loading ${bibleId} from disk cache: ${filePath}`)
    try {
      const data = await readFile(filePath, 'utf-8')
      rawVerses = JSON.parse(data)
    } catch (err) {
      console.warn(`[Bolls] Corrupt cache file for ${bibleId}, re-downloading...`, err)
      await unlink(filePath).catch(() => {})
      rawVerses = await downloadTranslation(bibleId, filePath)
    }
  } else {
    rawVerses = await downloadTranslation(bibleId, filePath)
  }

  const index = buildIndex(rawVerses)
  console.log(`[Bolls] ${bibleId} indexed: ${index.size} chapters, ${rawVerses.length} verses`)
  return index
}

async function downloadTranslation(bibleId: string, filePath: string): Promise<BollsRawVerse[]> {
  const url = `https://bolls.life/static/translations/${bibleId}.json`
  console.log(`[Bolls] Downloading full translation: ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to download ${bibleId} from Bolls: ${response.status} - ${errorText}`)
  }

  const fullVerses: BollsRawVerse[] = await response.json()

  // Strip comment and translation fields to save disk space (~40%)
  const stripped = fullVerses.map(v => ({
    pk: v.pk,
    book: v.book,
    chapter: v.chapter,
    verse: v.verse,
    text: v.text,
  }))

  await writeFile(filePath, JSON.stringify(stripped))
  console.log(`[Bolls] Saved ${bibleId} to disk: ${filePath} (${stripped.length} verses)`)

  return stripped
}

function ensureTranslationLoaded(bibleId: string): Promise<ChapterIndex> {
  const existing = memoryIndex.get(bibleId)
  if (existing) return Promise.resolve(existing)

  // Promise coalescing: if another request is already loading this translation, reuse it
  const pending = pendingLoads.get(bibleId)
  if (pending) return pending

  const promise = loadTranslation(bibleId)
    .then(index => {
      memoryIndex.set(bibleId, index)
      return index
    })
    .finally(() => {
      pendingLoads.delete(bibleId)
    })

  pendingLoads.set(bibleId, promise)
  return promise
}

async function fetchChapter(bibleId: string, bookNumber: number, chapter: number): Promise<BollsVerse[]> {
  const index = await ensureTranslationLoaded(bibleId)
  const key = `${bookNumber}/${chapter}`
  const verses = index.get(key)

  if (!verses || verses.length === 0) {
    throw new Error(`No verses found for ${bibleId} book=${bookNumber} chapter=${chapter}`)
  }

  return verses
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function cleanVerseText(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s*\[\d+\]/g, '').replace(/[\u24B6-\u24E9\u2460-\u2473]/g, '')
}

export function isBollsBibleConfigured(bibleId: string | undefined): boolean {
  return !!bibleId
}

async function fetchFilteredVerses(params: FetchVerseParams): Promise<BollsVerse[]> {
  const { bibleId, bookId, chapter, verseStart, verseEnd } = params

  const bookNumber = USFM_TO_BOOK_NUMBER[bookId]
  if (!bookNumber) {
    throw new Error(`Unknown USFM book code: "${bookId}"`)
  }

  const remapped = remapReference(bibleId, bookId, chapter, verseStart, verseEnd)

  const verses = await fetchChapter(bibleId, bookNumber, remapped.chapter)

  let vs = remapped.verseStart
  let ve = remapped.verseEnd

  if (remapped.needsPsalmVerseOffset && vs !== undefined) {
    const nkjvVerses = await fetchChapter('NKJV', bookNumber, chapter)
    const nkjvMax = Math.max(...nkjvVerses.map(v => v.verse))
    const targetMax = Math.max(...verses.map(v => v.verse))
    const offset = targetMax - nkjvMax

    if (offset > 0) {
      console.log(`[Bolls remap] Psalm verse offset: +${offset} (NKJV max=${nkjvMax}, ${bibleId} max=${targetMax})`)
      vs = vs + offset
      if (ve !== undefined) ve = ve + offset
    }
  }

  let filtered = verses
  if (vs !== undefined) {
    const end = ve ?? vs
    filtered = verses.filter(v => v.verse >= vs! && v.verse <= end)
  }

  if (filtered.length === 0) {
    throw new Error('No verse data returned from Bolls Bible')
  }

  return filtered
}

export async function fetchVerseData(params: FetchVerseParams): Promise<VerseData[]> {
  const filtered = await fetchFilteredVerses(params)
  return filtered.map(v => ({ verse: v.verse, text: cleanVerseText(v.text) }))
}

export async function fetchVerseText(params: FetchVerseParams): Promise<string> {
  const filtered = await fetchFilteredVerses(params)
  return filtered.map(v => cleanVerseText(v.text)).join(' ').trim()
}
