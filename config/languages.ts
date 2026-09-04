// Single source of truth for language configuration
// Used by both nuxt.config.ts (i18n) and app/server code

export interface Language {
  code: string
  name: string           // English name
  nativeName: string     // Name in the language itself
  flag: string
  dir?: 'ltr' | 'rtl'    // Text direction (defaults to 'ltr')
  bibleId?: string       // Bolls.life translation ID for verse lookups
  bibleLabel?: string    // Display label for the Bible translation (defaults to bibleId)
  translationName?: string  // Language name used in LLM translation prompts when the plain name is ambiguous
  translationModel?: string // OpenRouter model override for this language (defaults come from app config)
  enabled?: boolean      // Whether the language is active in the UI (default: true)
}

// All known languages — disabled languages are available for API responses
// but hidden from the UI language selector, translation targets, and admin content
// find translations: https://bolls.life/static/bolls/app/views/languages.json
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', bibleId: 'NKJV' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', bibleId: 'NVI' }, //RV1960
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', bibleId: 'FRLSG', bibleLabel: 'LSG' }, //maybe BDS
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', bibleId: 'NAA', translationName: 'Brazilian Portuguese' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', bibleId: 'S00', bibleLabel: 'SCH2000', enabled: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', bibleId: 'NR06', enabled: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', bibleId: 'CUNPS', translationName: 'Simplified Chinese', enabled: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', dir: 'rtl', bibleId: 'SVD', translationName: 'Modern Standard Arabic' }, // NAV (New Arabic Version) would be better but not on Bolls
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', bibleId: 'SYNOD' }, // NRT (New Russian Translation) is a modern alternative
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', bibleId: 'HIOV', bibleLabel: 'OV', enabled: false },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴', bibleId: 'NTR', enabled: false },
]

// All language codes
export const LANGUAGE_CODES = LANGUAGES.map(lang => lang.code)

// Enabled languages — used for front-end language switcher and i18n locales
export const ENABLED_LANGUAGES = LANGUAGES.filter(lang => lang.enabled !== false)
export const ENABLED_LANGUAGE_CODES = ENABLED_LANGUAGES.map(lang => lang.code)

// Generate i18n locale config from enabled languages only
export function generateI18nLocales() {
  return ENABLED_LANGUAGES.map(lang => ({
    code: lang.code,
    name: lang.nativeName,
    ...(lang.dir && { dir: lang.dir }),
    files: [
      `${lang.code}/common.json`,
      `${lang.code}/people-groups.json`,
      `${lang.code}/languages.json`
    ]
  }))
}
