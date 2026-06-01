/**
 * Bible book name to USFM code mapping and reference parser.
 * Shared between client and server (isomorphic).
 *
 * Localized book names live in i18n/locales/{lang}/bible.json.
 * When adding a new language, create a bible.json file for it.
 */

import enBooks from '../i18n/locales/en/bible.json'
import esBooks from '../i18n/locales/es/bible.json'
import frBooks from '../i18n/locales/fr/bible.json'
import ptBooks from '../i18n/locales/pt/bible.json'
import deBooks from '../i18n/locales/de/bible.json'
import itBooks from '../i18n/locales/it/bible.json'
import zhBooks from '../i18n/locales/zh/bible.json'
import arBooks from '../i18n/locales/ar/bible.json'
import ruBooks from '../i18n/locales/ru/bible.json'
import hiBooks from '../i18n/locales/hi/bible.json'
import roBooks from '../i18n/locales/ro/bible.json'

export interface ParsedReference {
  bookId: string
  chapter: number
  verseStart?: number
  verseEnd?: number
}

// Per-locale JSON files keyed by language code
const localeBooks: Record<string, Record<string, string>> = {
  en: enBooks, es: esBooks, fr: frBooks, pt: ptBooks, de: deBooks,
  it: itBooks, zh: zhBooks, ar: arBooks, ru: ruBooks, hi: hiBooks, ro: roBooks,
}

/**
 * Localized book names: USFM code → { langCode: bookName }
 * Built from per-locale i18n/locales/{lang}/bible.json files.
 */
export const BOOK_NAMES: Record<string, Record<string, string>> = {}
for (const [lang, books] of Object.entries(localeBooks)) {
  for (const [usfm, name] of Object.entries(books)) {
    if (!BOOK_NAMES[usfm]) BOOK_NAMES[usfm] = {}
    BOOK_NAMES[usfm][lang] = name
  }
}

// Maps lowercase book names/abbreviations to USFM book codes
const BOOK_LOOKUP: Record<string, string> = {
  // Genesis
  genesis: 'GEN', gen: 'GEN', ge: 'GEN',
  // Exodus
  exodus: 'EXO', exod: 'EXO', exo: 'EXO', ex: 'EXO',
  // Leviticus
  leviticus: 'LEV', lev: 'LEV', le: 'LEV',
  // Numbers
  numbers: 'NUM', num: 'NUM', nu: 'NUM', nm: 'NUM',
  // Deuteronomy
  deuteronomy: 'DEU', deut: 'DEU', deu: 'DEU', dt: 'DEU',
  // Joshua
  joshua: 'JOS', josh: 'JOS', jos: 'JOS',
  // Judges
  judges: 'JDG', judg: 'JDG', jdg: 'JDG',
  // Ruth
  ruth: 'RUT', rut: 'RUT', ru: 'RUT',
  // 1 Samuel
  '1 samuel': '1SA', '1samuel': '1SA', '1 sam': '1SA', '1sam': '1SA', '1 sa': '1SA', '1sa': '1SA',
  // 2 Samuel
  '2 samuel': '2SA', '2samuel': '2SA', '2 sam': '2SA', '2sam': '2SA', '2 sa': '2SA', '2sa': '2SA',
  // 1 Kings
  '1 kings': '1KI', '1kings': '1KI', '1 kgs': '1KI', '1kgs': '1KI', '1 ki': '1KI', '1ki': '1KI',
  // 2 Kings
  '2 kings': '2KI', '2kings': '2KI', '2 kgs': '2KI', '2kgs': '2KI', '2 ki': '2KI', '2ki': '2KI',
  // 1 Chronicles
  '1 chronicles': '1CH', '1chronicles': '1CH', '1 chr': '1CH', '1chr': '1CH', '1 ch': '1CH', '1ch': '1CH',
  // 2 Chronicles
  '2 chronicles': '2CH', '2chronicles': '2CH', '2 chr': '2CH', '2chr': '2CH', '2 ch': '2CH', '2ch': '2CH',
  // Ezra
  ezra: 'EZR', ezr: 'EZR',
  // Nehemiah
  nehemiah: 'NEH', neh: 'NEH', ne: 'NEH',
  // Esther
  esther: 'EST', est: 'EST', esth: 'EST',
  // Job
  job: 'JOB', jb: 'JOB',
  // Psalms
  psalms: 'PSA', psalm: 'PSA', psa: 'PSA', ps: 'PSA',
  // Proverbs
  proverbs: 'PRO', prov: 'PRO', pro: 'PRO', pr: 'PRO',
  // Ecclesiastes
  ecclesiastes: 'ECC', eccl: 'ECC', ecc: 'ECC', ec: 'ECC',
  // Song of Solomon
  'song of solomon': 'SNG', 'song of songs': 'SNG', 'songs of solomon': 'SNG', song: 'SNG', sng: 'SNG', sos: 'SNG', ss: 'SNG',
  // Isaiah
  isaiah: 'ISA', isa: 'ISA', is: 'ISA',
  // Jeremiah
  jeremiah: 'JER', jer: 'JER', je: 'JER',
  // Lamentations
  lamentations: 'LAM', lam: 'LAM', la: 'LAM',
  // Ezekiel
  ezekiel: 'EZK', ezek: 'EZK', ezk: 'EZK', eze: 'EZK',
  // Daniel
  daniel: 'DAN', dan: 'DAN', da: 'DAN',
  // Hosea
  hosea: 'HOS', hos: 'HOS', ho: 'HOS',
  // Joel
  joel: 'JOL', jol: 'JOL',
  // Amos
  amos: 'AMO', amo: 'AMO', am: 'AMO',
  // Obadiah
  obadiah: 'OBA', obad: 'OBA', oba: 'OBA', ob: 'OBA',
  // Jonah
  jonah: 'JON', jon: 'JON',
  // Micah
  micah: 'MIC', mic: 'MIC',
  // Nahum
  nahum: 'NAM', nah: 'NAM', nam: 'NAM', na: 'NAM',
  // Habakkuk
  habakkuk: 'HAB', hab: 'HAB',
  // Zephaniah
  zephaniah: 'ZEP', zeph: 'ZEP', zep: 'ZEP',
  // Haggai
  haggai: 'HAG', hag: 'HAG',
  // Zechariah
  zechariah: 'ZEC', zech: 'ZEC', zec: 'ZEC',
  // Malachi
  malachi: 'MAL', mal: 'MAL',

  // --- New Testament ---
  // Matthew
  matthew: 'MAT', matt: 'MAT', mat: 'MAT', mt: 'MAT',
  // Mark
  mark: 'MRK', mrk: 'MRK', mk: 'MRK',
  // Luke
  luke: 'LUK', luk: 'LUK', lk: 'LUK',
  // John
  john: 'JHN', jhn: 'JHN', jn: 'JHN',
  // Acts
  acts: 'ACT', act: 'ACT', ac: 'ACT',
  // Romans
  romans: 'ROM', rom: 'ROM', ro: 'ROM',
  // 1 Corinthians
  '1 corinthians': '1CO', '1corinthians': '1CO', '1 cor': '1CO', '1cor': '1CO', '1 co': '1CO', '1co': '1CO',
  // 2 Corinthians
  '2 corinthians': '2CO', '2corinthians': '2CO', '2 cor': '2CO', '2cor': '2CO', '2 co': '2CO', '2co': '2CO',
  // Galatians
  galatians: 'GAL', gal: 'GAL', ga: 'GAL',
  // Ephesians
  ephesians: 'EPH', eph: 'EPH',
  // Philippians
  philippians: 'PHP', phil: 'PHP', php: 'PHP',
  // Colossians
  colossians: 'COL', col: 'COL',
  // 1 Thessalonians
  '1 thessalonians': '1TH', '1thessalonians': '1TH', '1 thess': '1TH', '1thess': '1TH', '1 th': '1TH', '1th': '1TH',
  // 2 Thessalonians
  '2 thessalonians': '2TH', '2thessalonians': '2TH', '2 thess': '2TH', '2thess': '2TH', '2 th': '2TH', '2th': '2TH',
  // 1 Timothy
  '1 timothy': '1TI', '1timothy': '1TI', '1 tim': '1TI', '1tim': '1TI', '1 ti': '1TI', '1ti': '1TI',
  // 2 Timothy
  '2 timothy': '2TI', '2timothy': '2TI', '2 tim': '2TI', '2tim': '2TI', '2 ti': '2TI', '2ti': '2TI',
  // Titus
  titus: 'TIT', tit: 'TIT',
  // Philemon
  philemon: 'PHM', phlm: 'PHM', phm: 'PHM',
  // Hebrews
  hebrews: 'HEB', heb: 'HEB',
  // James
  james: 'JAS', jas: 'JAS', jm: 'JAS',
  // 1 Peter
  '1 peter': '1PE', '1peter': '1PE', '1 pet': '1PE', '1pet': '1PE', '1 pe': '1PE', '1pe': '1PE',
  // 2 Peter
  '2 peter': '2PE', '2peter': '2PE', '2 pet': '2PE', '2pet': '2PE', '2 pe': '2PE', '2pe': '2PE',
  // 1 John
  '1 john': '1JN', '1john': '1JN', '1 jn': '1JN', '1jn': '1JN',
  // 2 John
  '2 john': '2JN', '2john': '2JN', '2 jn': '2JN', '2jn': '2JN',
  // 3 John
  '3 john': '3JN', '3john': '3JN', '3 jn': '3JN', '3jn': '3JN',
  // Jude
  jude: 'JUD', jud: 'JUD',
  // Revelation
  revelation: 'REV', revelations: 'REV', rev: 'REV', re: 'REV',
}

// Populate BOOK_LOOKUP with all localized names so parseReference() works in any language
for (const [usfmCode, names] of Object.entries(BOOK_NAMES)) {
  for (const name of Object.values(names)) {
    const key = name.toLowerCase()
    if (!BOOK_LOOKUP[key]) {
      BOOK_LOOKUP[key] = usfmCode
    }
  }
}

/**
 * Reconstruct a reference string using the localized book name.
 */
export function localizeReference(parsed: ParsedReference, targetLanguage: string): string {
  const bookName = BOOK_NAMES[parsed.bookId]?.[targetLanguage]
    || BOOK_NAMES[parsed.bookId]?.en || parsed.bookId
  let ref = `${bookName} ${parsed.chapter}`
  if (parsed.verseStart !== undefined) {
    ref += `:${parsed.verseStart}`
    if (parsed.verseEnd !== undefined && parsed.verseEnd !== parsed.verseStart) {
      ref += `-${parsed.verseEnd}`
    }
  }
  return ref
}

/**
 * Parse a Bible reference string into structured components.
 * Handles formats like: "John 3:16", "1 Corinthians 13:4-7", "Psalm 23", "Gen 1:1-3"
 * Supports localized book names (Unicode letters) in all configured languages.
 */
export function parseReference(reference: string): ParsedReference | null {
  if (!reference || typeof reference !== 'string') return null

  const trimmed = reference.trim()
  if (!trimmed) return null

  // Normalize Roman numeral prefixes: "I Timothy" → "1 Timothy", "II Cor" → "2 Cor"
  const normalized = trimmed
    .replace(/^III\s+/i, '3 ')
    .replace(/^II\s+/i, '2 ')
    .replace(/^I\s+/i, '1 ')
    // Strip letter suffixes from verse numbers: "6:10c" → "6:10", "53:5a" → "53:5"
    .replace(/(\d)[a-z](?=\s*[-–—]|\s*$)/gi, '$1')
    // Normalize spaces around colon: "107: 23" → "107:23"
    .replace(/:\s+/g, ':')

  // Regex: optional numeric prefix + book name (Unicode letters), then chapter, then optional :verse(-verse)
  // Examples: "John 3:16", "1 Cor 13:4-7", "Psalm 23", "3 John 1:4"
  const match = normalized.match(
    /^(\d?\s*[\p{L}][\p{L}\s]*?)\s+(\d+)(?::(\d+)(?:\s*[-–—]\s*(\d+))?)?$/u
  )

  if (!match) return null

  const bookName = match[1]!.trim().toLowerCase()
  const chapter = parseInt(match[2]!, 10)
  const verseStart = match[3] ? parseInt(match[3], 10) : undefined
  const verseEnd = match[4] ? parseInt(match[4], 10) : undefined

  const bookId = BOOK_LOOKUP[bookName]
  if (!bookId) return null

  if (isNaN(chapter) || chapter < 1) return null
  if (verseStart !== undefined && (isNaN(verseStart) || verseStart < 1)) return null
  if (verseEnd !== undefined && (isNaN(verseEnd) || verseEnd < 1)) return null

  return { bookId, chapter, verseStart, verseEnd }
}
